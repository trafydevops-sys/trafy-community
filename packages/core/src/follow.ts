import { z } from "zod";

export const followInput = z.object({
  userId: z.string().uuid(),
});
export type FollowInput = z.infer<typeof followInput>;

export const followStatusSchema = z.object({
  following: z.boolean(),
  followerCount: z.number().int().nonnegative(),
  followingCount: z.number().int().nonnegative(),
});
export type FollowStatus = z.infer<typeof followStatusSchema>;
