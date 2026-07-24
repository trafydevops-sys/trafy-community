import { z } from "zod";

export const channelTypeSchema = z.enum(["dm", "group"]);
export type ChannelType = z.infer<typeof channelTypeSchema>;

export const getOrCreateDmInput = z.object({
  userId: z.string().uuid(),
});
export type GetOrCreateDmInput = z.infer<typeof getOrCreateDmInput>;

export const createGroupInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  memberIds: z.array(z.string().uuid()).max(200).default([]),
});
export type CreateGroupInput = z.infer<typeof createGroupInput>;

export const channelSchema = z.object({
  id: z.string().uuid(),
  type: channelTypeSchema,
  name: z.string().optional(),
  memberCount: z.number().int().nonnegative(),
  lastMessage: z
    .object({
      body: z.string(),
      senderId: z.string().uuid(),
      createdAt: z.string(),
    })
    .optional(),
});
export type Channel = z.infer<typeof channelSchema>;

export const sendMessageInput = z.object({
  channelId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});
export type SendMessageInput = z.infer<typeof sendMessageInput>;

export const messageSchema = z.object({
  id: z.string().uuid(),
  channelId: z.string().uuid(),
  senderId: z.string().uuid(),
  senderName: z.string(),
  body: z.string(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof messageSchema>;

export const listMessagesInput = z.object({
  channelId: z.string().uuid(),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(30),
});
export type ListMessagesInput = z.infer<typeof listMessagesInput>;

export const listMessagesOutput = z.object({
  messages: z.array(messageSchema),
  nextCursor: z.string().uuid().optional(),
});
export type ListMessagesOutput = z.infer<typeof listMessagesOutput>;

// Socket.IO event payloads (client subscribes to `channel:{channelId}` after
// listMessages, and to `user:{userId}` for personal notification pushes).
export const socketMessageEventSchema = z.object({
  channelId: z.string().uuid(),
  message: messageSchema,
});
export type SocketMessageEvent = z.infer<typeof socketMessageEventSchema>;

export const socketTypingEventSchema = z.object({
  channelId: z.string().uuid(),
  userId: z.string().uuid(),
  typing: z.boolean(),
});
export type SocketTypingEvent = z.infer<typeof socketTypingEventSchema>;
