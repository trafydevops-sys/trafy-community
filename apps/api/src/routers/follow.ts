import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import { followInput, type FollowStatus } from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";
import { notify } from "../lib/notify.js";

async function statusFor(userId: string, viewerId: string): Promise<FollowStatus> {
  const [followerRows, followingRows, existingRows] = await Promise.all([
    db.select({ value: count() }).from(schema.follows).where(eq(schema.follows.followingId, userId)),
    db.select({ value: count() }).from(schema.follows).where(eq(schema.follows.followerId, userId)),
    db
      .select()
      .from(schema.follows)
      .where(and(eq(schema.follows.followerId, viewerId), eq(schema.follows.followingId, userId)))
      .limit(1),
  ]);

  return {
    following: existingRows.length > 0,
    followerCount: followerRows[0]?.value ?? 0,
    followingCount: followingRows[0]?.value ?? 0,
  };
}

export const followRouter = router({
  status: protectedProcedure.input(followInput).query(({ ctx, input }) => statusFor(input.userId, ctx.user.sub)),

  follow: protectedProcedure.input(followInput).mutation(async ({ ctx, input }) => {
    if (input.userId === ctx.user.sub) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "You can't follow yourself." });
    }

    await db
      .insert(schema.follows)
      .values({ followerId: ctx.user.sub, followingId: input.userId })
      .onConflictDoNothing();

    const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, ctx.user.sub)).limit(1);
    await notify(input.userId, "new_follower", {
      actorId: ctx.user.sub,
      actorName: profile?.fullName || ctx.user.email,
    });

    return statusFor(input.userId, ctx.user.sub);
  }),

  unfollow: protectedProcedure.input(followInput).mutation(async ({ ctx, input }) => {
    await db
      .delete(schema.follows)
      .where(and(eq(schema.follows.followerId, ctx.user.sub), eq(schema.follows.followingId, input.userId)));
    return statusFor(input.userId, ctx.user.sub);
  }),
});
