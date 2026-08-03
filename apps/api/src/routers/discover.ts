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

  suggest: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.sub;

    // 1. Mutuals heuristic using raw SQL
    // Find users followed by people I follow, that I don't follow and have no connection with.
    const mutualsQuery = await db.execute<{ user_id: string; full_name: string; title: string | null; mutual_count: number }>(sql`
      WITH my_follows AS (
        SELECT following_id FROM follows WHERE follower_id = ${userId}
      ),
      my_connections AS (
        SELECT addressee_id AS connected_to FROM connections WHERE requester_id = ${userId} AND status IN ('pending', 'accepted')
        UNION
        SELECT requester_id AS connected_to FROM connections WHERE addressee_id = ${userId} AND status IN ('pending', 'accepted')
      )
      SELECT 
        f2.following_id AS user_id, 
        p.full_name, 
        p.title,
        COUNT(DISTINCT f2.follower_id)::int AS mutual_count
      FROM follows f2
      JOIN my_follows mf ON mf.following_id = f2.follower_id
      JOIN profiles p ON p.user_id = f2.following_id
      WHERE f2.following_id != ${userId}
        AND f2.following_id NOT IN (SELECT following_id FROM my_follows)
        AND f2.following_id NOT IN (SELECT connected_to FROM my_connections)
      GROUP BY f2.following_id, p.full_name, p.title
      ORDER BY mutual_count DESC
      LIMIT 15;
    `);

    // 2. Fetch my profile to get my education
    const myProfile = await db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, userId),
    });

    const myInstitutions = myProfile?.education 
      ? (myProfile.education as any[]).map(e => e.institution)
      : [];

    let collegeMatches: any[] = [];
    
    if (myInstitutions.length > 0) {
      // Find people who have the same institution in their education JSONB
      // Simplest way is to fetch some profiles and filter in memory, or use JSONB query.
      // Drizzle JSONB is tricky, let's just fetch recent users and filter.
      // Or use a simple text search on the JSONB column.
      const instQuery = myInstitutions[0]; // Just use the first one
      
      const collegeQuery = await db.execute<{ user_id: string; full_name: string; title: string | null }>(sql`
        WITH my_connections AS (
          SELECT addressee_id AS connected_to FROM connections WHERE requester_id = ${userId} AND status IN ('pending', 'accepted')
          UNION
          SELECT requester_id AS connected_to FROM connections WHERE addressee_id = ${userId} AND status IN ('pending', 'accepted')
        )
        SELECT 
          user_id, 
          full_name, 
          title
        FROM profiles
        WHERE user_id != ${userId}
          AND user_id NOT IN (SELECT connected_to FROM my_connections)
          AND education::text ILIKE ${'%' + instQuery + '%'}
        LIMIT 10;
      `);
      collegeMatches = collegeQuery as any;
    }

    let mutualRows = mutualsQuery as any;

    const suggestionsMap = new Map<string, any>();

    for (const r of mutualRows) {
      suggestionsMap.set(r.user_id, {
        userId: r.user_id,
        fullName: r.full_name,
        title: r.title || undefined,
        mutualCount: r.mutual_count,
        sharedCollege: false,
        connectionStatus: null, // we know it's null from the NOT IN query
      });
    }

    for (const r of collegeMatches) {
      if (!suggestionsMap.has(r.user_id)) {
        suggestionsMap.set(r.user_id, {
          userId: r.user_id,
          fullName: r.full_name,
          title: r.title || undefined,
          mutualCount: 0,
          sharedCollege: true,
          connectionStatus: null,
        });
      } else {
        suggestionsMap.get(r.user_id).sharedCollege = true;
      }
    }

    return Array.from(suggestionsMap.values());
  }),
});
