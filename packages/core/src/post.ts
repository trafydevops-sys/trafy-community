import { z } from "zod";

export const postKindSchema = z.enum(["text", "image", "link", "pdf", "achievement"]);
export type PostKind = z.infer<typeof postKindSchema>;

export const createPostInput = z.object({
  body: z.string().trim().max(2000).default(""),
  kind: postKindSchema.default("text"),
  // image / pdf
  mediaUrl: z.string().url().optional(),
  // link
  linkUrl: z.string().url().optional(),
  linkTitle: z.string().optional(),
  linkImage: z.string().url().optional(),
  linkDescription: z.string().optional(),
  organizationId: z.string().uuid().optional(), // post as org
}).refine(
  (d) => {
    if (d.kind === "text") return d.body.trim().length > 0;
    if (d.kind === "image" || d.kind === "pdf") return !!d.mediaUrl;
    if (d.kind === "link") return !!d.linkUrl;
    return true; // achievement posts are backend-only
  },
  { message: "Post content is required for the chosen post type." }
);
export type CreatePostInput = z.infer<typeof createPostInput>;

export const postAuthorSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  avatarUrl: z.string().optional(), // For org logo
  isOrg: z.boolean().optional(),
});
export type PostAuthor = z.infer<typeof postAuthorSchema>;

export const postSchema = z.object({
  id: z.string().uuid(),
  author: postAuthorSchema,
  body: z.string(),
  kind: postKindSchema,
  mediaUrl: z.string().nullable().optional(),
  linkUrl: z.string().nullable().optional(),
  linkTitle: z.string().nullable().optional(),
  linkImage: z.string().nullable().optional(),
  linkDescription: z.string().nullable().optional(),
  createdAt: z.string(),
  reactionCount: z.number().int().nonnegative(),
  reactedByMe: z.boolean(),
  commentCount: z.number().int().nonnegative(),
  savedByMe: z.boolean(),
  organizationId: z.string().uuid().nullable().optional(),
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

export const savePostInput = z.object({
  postId: z.string().uuid(),
});
export type SavePostInput = z.infer<typeof savePostInput>;

export const reportPostInput = z.object({
  postId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});
export type ReportPostInput = z.infer<typeof reportPostInput>;

export const scrapeOgInput = z.object({
  url: z.string().url(),
});
export type ScrapeOgInput = z.infer<typeof scrapeOgInput>;

export const ogDataSchema = z.object({
  title: z.string().optional(),
  image: z.string().optional(),
  description: z.string().optional(),
  siteName: z.string().optional(),
});
export type OgData = z.infer<typeof ogDataSchema>;

// Comments

export const postCommentSchema = z.object({
  id: z.string().uuid(),
  postId: z.string().uuid(),
  author: postAuthorSchema,
  parentId: z.string().uuid().nullable().optional(),
  body: z.string(),
  createdAt: z.string(),
});
export type PostComment = z.infer<typeof postCommentSchema>;

export const addCommentInput = z.object({
  postId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
  body: z.string().trim().min(1).max(2000),
});
export type AddCommentInput = z.infer<typeof addCommentInput>;

export const listCommentsInput = z.object({
  postId: z.string().uuid(),
});
export type ListCommentsInput = z.infer<typeof listCommentsInput>;
