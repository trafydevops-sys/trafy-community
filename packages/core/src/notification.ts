import { z } from "zod";

export const notificationTypeSchema = z.enum([
  "new_follower",
  "post_reaction",
  "post_comment",
  "chat_message",
  "course_sale",
  "job_application",
  "application_status_changed",
  "contract_created",
  "milestone_funded",
  "milestone_released",
  "org_invite",
  "connection_request",
  "connection_accepted",
  "user_warned",
  "user_suspended",
  "user_banned",
  "user_unsuspended",
  "appeal_approved",
  "appeal_rejected",
  "report_resolved",
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const notificationSchema = z.object({
  id: z.string().uuid(),
  type: notificationTypeSchema,
  // Loosely typed on purpose — payload shape varies per notification type
  // (actorId/actorName always present; postId or channelId depending on type).
  payload: z.record(z.string(), z.unknown()),
  read: z.boolean(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const listNotificationsInput = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type ListNotificationsInput = z.infer<typeof listNotificationsInput>;

export const listNotificationsOutput = z.object({
  notifications: z.array(notificationSchema),
  unreadCount: z.number().int().nonnegative(),
  nextCursor: z.string().uuid().optional(),
});
export type ListNotificationsOutput = z.infer<typeof listNotificationsOutput>;

// Socket.IO push to the recipient's personal room (`user:{userId}`).
export const socketNotificationEventSchema = notificationSchema;
