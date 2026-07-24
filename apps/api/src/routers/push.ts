import { and, eq } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import { registerPushTokenInput, unregisterPushTokenInput } from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";

export const pushRouter = router({
  // Idempotent: re-registering the same token (app relaunch, token refresh
  // callback firing again) just touches updatedAt. A token that belonged to
  // a different signed-out user gets reassigned to whoever's calling now —
  // that's the same device re-registering after a different account signed in.
  registerToken: protectedProcedure.input(registerPushTokenInput).mutation(async ({ ctx, input }) => {
    await db
      .insert(schema.pushTokens)
      .values({ userId: ctx.user.sub, token: input.token, platform: input.platform })
      .onConflictDoUpdate({
        target: schema.pushTokens.token,
        set: { userId: ctx.user.sub, platform: input.platform, updatedAt: new Date() },
      });
    return { ok: true as const };
  }),

  unregisterToken: protectedProcedure.input(unregisterPushTokenInput).mutation(async ({ ctx, input }) => {
    await db
      .delete(schema.pushTokens)
      .where(and(eq(schema.pushTokens.token, input.token), eq(schema.pushTokens.userId, ctx.user.sub)));
    return { ok: true as const };
  }),

  myTokens: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select().from(schema.pushTokens).where(eq(schema.pushTokens.userId, ctx.user.sub));
    return rows.map((r) => ({ token: r.token, platform: r.platform as "ios" | "android", createdAt: r.createdAt.toISOString() }));
  }),
});
