import { z } from "zod";

// certificate/avatar from Milestone 1; course_video added in Milestone 3 (Learning Hub).
export const uploadKindSchema = z.enum(["certificate", "avatar", "course_video", "resume", "viva_recording"]);
export type UploadKind = z.infer<typeof uploadKindSchema>;

export const uploadResultSchema = z.object({
  url: z.string().min(1),
  kind: uploadKindSchema,
  sizeBytes: z.number().int().nonnegative(),
  contentType: z.string(),
});
export type UploadResult = z.infer<typeof uploadResultSchema>;
