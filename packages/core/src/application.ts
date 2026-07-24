import { z } from "zod";

export const applicationStatusSchema = z.enum(["applied", "reviewing", "interview", "offer", "hired", "rejected"]);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

// The order pipeline stages progress through — used by the UI to render a
// stage tracker and to guard against moving an application backwards.
export const APPLICATION_PIPELINE_ORDER: ApplicationStatus[] = [
  "applied",
  "reviewing",
  "interview",
  "offer",
  "hired",
];

export const applyToJobInput = z.object({
  jobId: z.string().uuid(),
  coverNote: z.string().trim().max(3000).optional(),
});
export type ApplyToJobInput = z.infer<typeof applyToJobInput>;

export const updateApplicationStatusInput = z.object({
  applicationId: z.string().uuid(),
  status: applicationStatusSchema,
});
export type UpdateApplicationStatusInput = z.infer<typeof updateApplicationStatusInput>;

export const applicationSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  jobTitle: z.string(),
  applicantId: z.string().uuid(),
  applicantName: z.string(),
  coverNote: z.string().optional(),
  status: applicationStatusSchema,
  hasContract: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Application = z.infer<typeof applicationSchema>;

export const listApplicationsForJobInput = z.object({ jobId: z.string().uuid() });
export type ListApplicationsForJobInput = z.infer<typeof listApplicationsForJobInput>;
