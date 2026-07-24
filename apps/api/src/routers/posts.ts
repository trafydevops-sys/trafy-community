import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import { createPostInput, feedInput, reactToPostInput, type Post } from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";
import { notify } from "../lib/notify.js";

async function authorName(userId: string, fallbackEmail: string): Promise<string> {
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1);
  return profile?.fullName || fallbackEmail;
}

export const postsRouter = router({
  create: protectedProcedure.input(createPostInput).mutation(async ({ ctx, input }) => {
    const [row] = await db.insert(schema.posts).values({ authorId: ctx.user.sub, body: input.body }).returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const post: Post = {
      id: row.id,
      author: { id: ctx.user.sub, fullName: await authorName(ctx.user.sub, ctx.user.email) },
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      reactionCount: 0,
      reactedByMe: false,
    };
    return post;
  }),

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

    const whereCondition = cursorCreatedAt
      ? and(scopeCondition, lt(schema.posts.createdAt, cursorCreatedAt))
      : scopeCondition;

    const rows = await db
      .select({
        id: schema.posts.id,
        body: schema.posts.body,
        createdAt: schema.posts.createdAt,
        authorId: schema.posts.authorId,
        authorFullName: schema.profiles.fullName,
      })
      .from(schema.posts)
      .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.posts.authorId))
      .where(whereCondition)
      .orderBy(desc(schema.posts.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const postIds = page.map((r) => r.id);

    const reactions = postIds.length
      ? await db.select().from(schema.postReactions).where(inArray(schema.postReactions.postId, postIds))
      : [];
    const countByPost = new Map<string, number>();
    const reactedByMeSet = new Set<string>();
    for (const r of reactions) {
      countByPost.set(r.postId, (countByPost.get(r.postId) ?? 0) + 1);
      if (r.userId === ctx.user.sub) reactedByMeSet.add(r.postId);
    }

    const posts: Post[] = page.map((r) => ({
      id: r.id,
      author: { id: r.authorId, fullName: r.authorFullName || "" },
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      reactionCount: countByPost.get(r.id) ?? 0,
      reactedByMe: reactedByMeSet.has(r.id),
    }));

    return { posts, nextCursor: hasMore ? page[page.length - 1]?.id : undefined };
  }),

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
});
