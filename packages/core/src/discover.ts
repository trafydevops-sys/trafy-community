import { z } from "zod";

export const discoverSearchInput = z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(50).default(20),
});
export type DiscoverSearchInput = z.infer<typeof discoverSearchInput>;

export const discoverResultSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string(),
  title: z.string().optional(),
  bio: z.string().optional(),
  following: z.boolean(),
});
export type DiscoverResult = z.infer<typeof discoverResultSchema>;
