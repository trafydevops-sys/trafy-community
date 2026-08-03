import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import {
  addCommentInput,
  createPostInput,
  feedInput,
  listCommentsInput,
  reactToPostInput,
  reportPostInput,
  savePostInput,
  scrapeOgInput,
  type Post,
  type PostComment,
} from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";
import { notify } from "../lib/notify.js";
import { scrapeOgTags } from "../lib/og-scraper.js";

async function authorName(userId: string, fallbackEmail: string): Promise<string> {
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1);
  return profile?.fullName || fallbackEmail;
}

function rowToPost(
  r: {
    id: string;
    body: string;
    kind: string;
    mediaUrl: string | null;
    linkUrl: string | null;
    linkTitle: string | null;
    linkImage: string | null;
    linkDescription: string | null;
    createdAt: Date;
    authorId: string;
    authorFullName: string | null;
    organizationId: string | null;
    organizationName?: string | null;
    organizationLogoUrl?: string | null;
  },
  reactionCount: number,
  reactedByMe: boolean,
  commentCount: number,
  savedByMe: boolean,
): Post {
  return {
    id: r.id,
    author: r.organizationId && r.organizationName
      ? { id: r.organizationId, fullName: r.organizationName, avatarUrl: r.organizationLogoUrl || undefined, isOrg: true }
      : { id: r.authorId, fullName: r.authorFullName || "" },
    body: r.body,
    kind: r.kind as Post["kind"],
    mediaUrl: r.mediaUrl,
    linkUrl: r.linkUrl,
    linkTitle: r.linkTitle,
    linkImage: r.linkImage,
    linkDescription: r.linkDescription,
    createdAt: r.createdAt.toISOString(),
    reactionCount,
    reactedByMe,
    commentCount,
    savedByMe,
    organizationId: r.organizationId,
  };
}

export const postsRouter = router({
  // ────────────────────────────────────────────────────────
  // Create post (text / image / link / pdf)
  // ────────────────────────────────────────────────────────
  create: protectedProcedure.input(createPostInput).mutation(async ({ ctx, input }) => {
    const [row] = await db
      .insert(schema.posts)
      .values({
        authorId: ctx.user.sub,
        body: input.body,
        kind: input.kind,
        mediaUrl: input.mediaUrl,
        linkUrl: input.linkUrl,
        linkTitle: input.linkTitle,
        linkImage: input.linkImage,
        linkDescription: input.linkDescription,
        organizationId: input.organizationId,
      })
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const orgName = input.organizationId ? (await db.select().from(schema.organizations).where(eq(schema.organizations.id, input.organizationId)).limit(1))[0]?.name : null;
    const orgLogoUrl = input.organizationId ? (await db.select().from(schema.organizations).where(eq(schema.organizations.id, input.organizationId)).limit(1))[0]?.logoUrl : null;

    const post = rowToPost(
      { ...row, authorFullName: await authorName(ctx.user.sub, ctx.user.email), organizationName: orgName, organizationLogoUrl: orgLogoUrl },
      0, false, 0, false,
    );
    return post;
  }),

  // ────────────────────────────────────────────────────────
  // Scrape OG tags for link preview (called from composer)
  // ────────────────────────────────────────────────────────
  scrapeOg: protectedProcedure.input(scrapeOgInput).query(async ({ input }) => {
    return scrapeOgTags(input.url);
  }),

  // ────────────────────────────────────────────────────────
  // Paginated feed
  // ────────────────────────────────────────────────────────
  feed: protectedProcedure.input(feedInput).query(async ({ ctx, input }) => {
    let cursorCreatedAt: Date | undefined;
    if (input.cursor) {
      const [cursorRow] = await db
        .select({ createdAt: schema.posts.createdAt })
        .from(schema.posts)
        .where(eq(schema.posts.id, input.cursor))
        .limit(1);
      cursorCreatedAt = cursorRow?.createdAt;
    }

    const scopeCondition =
      input.scope === "following"
        ? or(
            eq(schema.posts.authorId, ctx.user.sub),
            inArray(
              schema.posts.authorId,
              db
                .select({ id: schema.follows.followingId })
                .from(schema.follows)
                .where(eq(schema.follows.followerId, ctx.user.sub))
            )
          )
        : undefined;

    const whereClause = cursorCreatedAt
      ? and(scopeCondition, lt(schema.posts.createdAt, cursorCreatedAt))
      : scopeCondition;

    const rows = await db
      .select({
        posts: schema.posts,
        profiles: schema.profiles,
        organizations: schema.organizations,
      })
      .from(schema.posts)
      .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.posts.authorId))
      .leftJoin(schema.organizations, eq(schema.organizations.id, schema.posts.organizationId))
      .where(whereClause)
      .orderBy(desc(schema.posts.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
    const postIds = pageRows.map((r) => r.posts.id);

    if (!postIds.length) return { posts: [], nextCursor: undefined };

    // Reactions
    const reactions = await db
      .select()
      .from(schema.postReactions)
      .where(inArray(schema.postReactions.postId, postIds));
    const reactionCountByPost = new Map<string, number>();
    const reactedByMeSet = new Set<string>();
    for (const r of reactions) {
      reactionCountByPost.set(r.postId, (reactionCountByPost.get(r.postId) ?? 0) + 1);
      if (r.userId === ctx.user.sub) reactedByMeSet.add(r.postId);
    }

    // Comment counts
    const commentCounts = await db
      .select({ postId: schema.postComments.postId, count: sql<number>`cast(count(*) as int)` })
      .from(schema.postComments)
      .where(inArray(schema.postComments.postId, postIds))
      .groupBy(schema.postComments.postId);
    const commentCountByPost = new Map(commentCounts.map((c) => [c.postId, c.count]));

    // Saved state
    const saved = await db
      .select({ postId: schema.savedPosts.postId })
      .from(schema.savedPosts)
      .where(and(eq(schema.savedPosts.userId, ctx.user.sub), inArray(schema.savedPosts.postId, postIds)));
    const savedSet = new Set(saved.map((s) => s.postId));

    const posts: Post[] = pageRows.map((r) =>
      rowToPost(
        { ...r.posts, authorFullName: r.profiles?.fullName || null, organizationName: r.organizations?.name || null, organizationLogoUrl: r.organizations?.logoUrl || null },
        reactionCountByPost.get(r.posts.id) ?? 0,
        reactedByMeSet.has(r.posts.id),
        commentCountByPost.get(r.posts.id) ?? 0,
        savedSet.has(r.posts.id),
      )
    );

    return { posts, nextCursor: hasMore ? pageRows[pageRows.length - 1]?.posts.id : undefined };
  }),

  // ────────────────────────────────────────────────────────
  // Reactions (toggle)
  // ────────────────────────────────────────────────────────
  react: protectedProcedure.input(reactToPostInput).mutation(async ({ ctx, input }) => {
    const [existing] = await db
      .select()
      .from(schema.postReactions)
      .where(and(eq(schema.postReactions.postId, input.postId), eq(schema.postReactions.userId, ctx.user.sub)))
      .limit(1);

    if (existing) {
      await db.delete(schema.postReactions).where(eq(schema.postReactions.id, existing.id));
      return { reacted: false as const };
    }

    await db.insert(schema.postReactions).values({ postId: input.postId, userId: ctx.user.sub });

    const [post] = await db.select().from(schema.posts).where(eq(schema.posts.id, input.postId)).limit(1);
    if (post && post.authorId !== ctx.user.sub) {
      await notify(post.authorId, "post_reaction", {
        actorId: ctx.user.sub,
        actorName: await authorName(ctx.user.sub, ctx.user.email),
        postId: post.id,
      });
    }
    return { reacted: true as const };
  }),

  // ────────────────────────────────────────────────────────
  // Save / unsave (bookmark toggle)
  // ────────────────────────────────────────────────────────
  save: protectedProcedure.input(savePostInput).mutation(async ({ ctx, input }) => {
    const [existing] = await db
      .select()
      .from(schema.savedPosts)
      .where(and(eq(schema.savedPosts.postId, input.postId), eq(schema.savedPosts.userId, ctx.user.sub)))
      .limit(1);

    if (existing) {
      await db
        .delete(schema.savedPosts)
        .where(and(eq(schema.savedPosts.postId, input.postId), eq(schema.savedPosts.userId, ctx.user.sub)));
      return { saved: false as const };
    }

    await db.insert(schema.savedPosts).values({ postId: input.postId, userId: ctx.user.sub });
    return { saved: true as const };
  }),

  // ────────────────────────────────────────────────────────
  // Report a post
  // ────────────────────────────────────────────────────────
  report: protectedProcedure.input(reportPostInput).mutation(async ({ ctx, input }) => {
    await db
      .insert(schema.postReports)
      .values({ postId: input.postId, reporterId: ctx.user.sub, reason: input.reason })
      .onConflictDoNothing(); // idempotent — one report per user per post
    return { ok: true };
  }),

  // ────────────────────────────────────────────────────────
  // Comments
  // ────────────────────────────────────────────────────────
  listComments: protectedProcedure.input(listCommentsInput).query(async ({ input }) => {
    const rows = await db
      .select({
        id: schema.postComments.id,
        postId: schema.postComments.postId,
        parentId: schema.postComments.parentId,
        body: schema.postComments.body,
        createdAt: schema.postComments.createdAt,
        authorId: schema.postComments.authorId,
        authorFullName: schema.profiles.fullName,
      })
      .from(schema.postComments)
      .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.postComments.authorId))
      .where(eq(schema.postComments.postId, input.postId))
      .orderBy(desc(schema.postComments.createdAt));

    const comments: PostComment[] = rows.map((r) => ({
      id: r.id,
      postId: r.postId,
      parentId: r.parentId,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      author: { id: r.authorId, fullName: r.authorFullName || "" },
    }));

    return comments;
  }),

  addComment: protectedProcedure.input(addCommentInput).mutation(async ({ ctx, input }) => {
    const [row] = await db
      .insert(schema.postComments)
      .values({
        postId: input.postId,
        authorId: ctx.user.sub,
        parentId: input.parentId,
        body: input.body,
      })
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Notify the post author (if different from commenter)
    const [post] = await db.select().from(schema.posts).where(eq(schema.posts.id, input.postId)).limit(1);
    if (post && post.authorId !== ctx.user.sub) {
      await notify(post.authorId, "post_comment", {
        actorId: ctx.user.sub,
        actorName: await authorName(ctx.user.sub, ctx.user.email),
        postId: post.id,
        commentId: row.id,
      });
    }

    const comment: PostComment = {
      id: row.id,
      postId: row.postId,
      parentId: row.parentId,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      author: { id: ctx.user.sub, fullName: await authorName(ctx.user.sub, ctx.user.email) },
    };
    return comment;
  }),
});
