import { z } from "zod";

export const createPostInput = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type CreatePostInput = z.infer<typeof createPostInput>;

export const postAuthorSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
});
export type PostAuthor = z.infer<typeof postAuthorSchema>;

export const postSchema = z.object({
  id: z.string().uuid(),
  author: postAuthorSchema,
  body: z.string(),
  createdAt: z.string(),
  reactionCount: z.number().int().nonnegative(),
  reactedByMe: z.boolean(),
});
export type Post = z.infer<typeof postSchema>;

export const feedInput = z.object({
  scope: z.enum(["everyone", "following"]).default("everyone"),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type FeedInput = z.infer<typeof feedInput>;

export const feedOutput = z.object({
  posts: z.array(postSchema),
  nextCursor: z.string().uuid().optional(),
});
export type FeedOutput = z.infer<typeof feedOutput>;

export const reactToPostInput = z.object({
  postId: z.string().uuid(),
});
export type ReactToPostInput = z.infer<typeof reactToPostInput>;
