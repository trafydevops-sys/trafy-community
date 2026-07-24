import { schema } from "@trafy-community/db";
import type { Notification, NotificationType } from "@trafy-community/core";
import { db } from "./db.js";
import { emitNotification } from "./realtime.js";
import { sendPushForNotification } from "./push-send.js";

/**
 * Persists a notification, pushes it live over the recipient's socket room
 * (for an open app), and best-effort delivers an Expo push notification (for
 * a closed/backgrounded app). Push delivery is fire-and-forget — a slow or
 * failing push send must never delay or fail the caller (chat sends,
 * reactions, etc. don't await notify() for this reason either).
 */
export async function notify(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>
): Promise<void> {
  const [row] = await db.insert(schema.notifications).values({ userId, type, payload }).returning();
  if (!row) return;

  const notification: Notification = {
    id: row.id,
    type: row.type as NotificationType,
    payload: row.payload as Record<string, unknown>,
    read: Boolean(row.readAt),
    createdAt: row.createdAt.toISOString(),
  };
  emitNotification(userId, notification);
  void sendPushForNotification(userId, type, payload);
}
