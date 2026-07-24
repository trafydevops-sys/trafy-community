import { sql, eq, ne, and, inArray } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import { discoverSearchInput, type DiscoverResult } from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";

export const discoverRouter = router({
  search: protectedProcedure.input(discoverSearchInput).query(async ({ ctx, input }) => {
    const rows = await db
      .select({
        userId: schema.profiles.userId,
        fullName: schema.profiles.fullName,
        title: schema.profiles.title,
        bio: schema.profiles.bio,
      })
      .from(schema.profiles)
      .where(
        and(
          ne(schema.profiles.userId, ctx.user.sub),
          sql`to_tsvector('english', ${schema.profiles.fullName} || ' ' || coalesce(${schema.profiles.title}, '') || ' ' || coalesce(${schema.profiles.bio}, '')) @@ plainto_tsquery('english', ${input.query})`
        )
      )
      .limit(input.limit);

    const userIds = rows.map((r) => r.userId);
    const following = userIds.length
      ? await db
          .select({ followingId: schema.follows.followingId })
          .from(schema.follows)
          .where(and(eq(schema.follows.followerId, ctx.user.sub), inArray(schema.follows.followingId, userIds)))
      : [];
    const followingSet = new Set(following.map((f) => f.followingId));

    const results: DiscoverResult[] = rows.map((r) => ({
      userId: r.userId,
      fullName: r.fullName,
      title: r.title ?? undefined,
      bio: r.bio ?? undefined,
      following: followingSet.has(r.userId),
    }));
    return results;
  }),
});
