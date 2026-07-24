import { and, count, desc, eq, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@trafy-community/db";
import { listNotificationsInput, type ListNotificationsOutput, type Notification } from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";

export const notificationsRouter = router({
  list: protectedProcedure.input(listNotificationsInput).query(async ({ ctx, input }) => {
    let cursorCreatedAt: Date | undefined;
    if (input.cursor) {
      const [cursorRow] = await db
        .select({ createdAt: schema.notifications.createdAt })
        .from(schema.notifications)
        .where(eq(schema.notifications.id, input.cursor))
        .limit(1);
      cursorCreatedAt = cursorRow?.createdAt;
    }

    const whereCondition = cursorCreatedAt
      ? and(eq(schema.notifications.userId, ctx.user.sub), lt(schema.notifications.createdAt, cursorCreatedAt))
      : eq(schema.notifications.userId, ctx.user.sub);

    const [rows, unreadRows] = await Promise.all([
      db
        .select()
        .from(schema.notifications)
        .where(whereCondition)
        .orderBy(desc(schema.notifications.createdAt))
        .limit(input.limit + 1),
      db
        .select({ value: count() })
        .from(schema.notifications)
        .where(and(eq(schema.notifications.userId, ctx.user.sub), isNull(schema.notifications.readAt))),
    ]);
    const unreadCount = unreadRows[0]?.value ?? 0;

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;

    const notifications: Notification[] = page.map((r) => ({
      id: r.id,
      type: r.type as Notification["type"],
      payload: r.payload as Record<string, unknown>,
      read: Boolean(r.readAt),
      createdAt: r.createdAt.toISOString(),
    }));

    const output: ListNotificationsOutput = {
      notifications,
      unreadCount,
      nextCursor: hasMore ? page[page.length - 1]?.id : undefined,
    };
    return output;
  }),

  markRead: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await db
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(and(eq(schema.notifications.id, input.id), eq(schema.notifications.userId, ctx.user.sub)));
    return { ok: true as const };
  }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await db
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(and(eq(schema.notifications.userId, ctx.user.sub), isNull(schema.notifications.readAt)));
    return { ok: true as const };
  }),
});
