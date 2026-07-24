import { z } from "zod";

export const createStudyGroupInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  topic: z.string().trim().max(120).optional(),
});
export type CreateStudyGroupInput = z.infer<typeof createStudyGroupInput>;

export const studyGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  topic: z.string().optional(),
  ownerId: z.string().uuid(),
  ownerName: z.string(),
  channelId: z.string().uuid(),
  memberCount: z.number().int().nonnegative(),
  isMember: z.boolean(),
  createdAt: z.string(),
});
export type StudyGroup = z.infer<typeof studyGroupSchema>;

export const listStudyGroupsInput = z.object({
  query: z.string().trim().max(200).optional(),
});
export type ListStudyGroupsInput = z.infer<typeof listStudyGroupsInput>;

export const studyGroupIdInput = z.object({ groupId: z.string().uuid() });
export type StudyGroupIdInput = z.infer<typeof studyGroupIdInput>;
