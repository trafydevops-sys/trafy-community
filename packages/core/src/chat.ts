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
  body: z.string().trim().min(1).max(4000).optional(), // body can be optional if media is present, but let's keep min(1) or make it optional with media? Wait, DB says body is not null. Let's make it optional string that defaults to empty space or just change it to optional in schema, but DB requires it. Let's make it optional if mediaUrl is provided. Or let's just make it z.string().max(4000).optional().
  mediaUrl: z.string().url().optional(),
  mediaKind: z.enum(["image", "pdf", "file"]).optional(),
}).refine(data => data.body || data.mediaUrl, {
  message: "Must provide either body or mediaUrl",
});
export type SendMessageInput = z.infer<typeof sendMessageInput>;

export const messageSchema = z.object({
  id: z.string().uuid(),
  channelId: z.string().uuid(),
  senderId: z.string().uuid(),
  senderName: z.string(),
  body: z.string(),
  mediaUrl: z.string().nullable().optional(),
  mediaKind: z.string().nullable().optional(),
  isInmail: z.boolean().default(false),
  createdAt: z.string(),
});
export type Message = z.infer<typeof messageSchema>;

export const markReadInput = z.object({
  channelId: z.string().uuid(),
  upToMessageId: z.string().uuid(),
});
export type MarkReadInput = z.infer<typeof markReadInput>;

export const sendInmailInput = z.object({
  addresseeId: z.string().uuid(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
});
export type SendInmailInput = z.infer<typeof sendInmailInput>;

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

export const messageReadEventSchema = z.object({
  channelId: z.string().uuid(),
  userId: z.string().uuid(),
  readUpToId: z.string().uuid(),
});
export type MessageReadEvent = z.infer<typeof messageReadEventSchema>;
