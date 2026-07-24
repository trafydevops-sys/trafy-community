import { z } from "zod";

export const jobTypeSchema = z.enum(["full_time", "contract", "freelance"]);
export type JobType = z.infer<typeof jobTypeSchema>;

export const compensationTypeSchema = z.enum(["salary", "hourly", "fixed"]);
export type CompensationType = z.infer<typeof compensationTypeSchema>;

export const createJobInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  jobType: jobTypeSchema.default("full_time"),
  compensationType: compensationTypeSchema.default("salary"),
  compensationMinCents: z.number().int().nonnegative().default(0),
  compensationMaxCents: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).default("usd"),
  location: z.string().trim().max(120).optional(),
});
export type CreateJobInput = z.infer<typeof createJobInput>;

export const updateJobInput = createJobInput.partial().extend({
  jobId: z.string().uuid(),
});
export type UpdateJobInput = z.infer<typeof updateJobInput>;

export const setJobPublishedInput = z.object({
  jobId: z.string().uuid(),
  published: z.boolean(),
});
export type SetJobPublishedInput = z.infer<typeof setJobPublishedInput>;

export const jobSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().optional(),
  jobType: jobTypeSchema,
  compensationType: compensationTypeSchema,
  compensationMinCents: z.number().int().nonnegative(),
  compensationMaxCents: z.number().int().nonnegative().optional(),
  currency: z.string(),
  location: z.string().optional(),
  published: z.boolean(),
  posterId: z.string().uuid(),
  posterName: z.string(),
  applicationCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type JobSummary = z.infer<typeof jobSummarySchema>;

export const listJobsInput = z.object({
  query: z.string().trim().max(200).optional(),
  jobType: jobTypeSchema.optional(),
});
export type ListJobsInput = z.infer<typeof listJobsInput>;

export const getJobInput = z.object({ jobId: z.string().uuid() });
export type GetJobInput = z.infer<typeof getJobInput>;

export const jobDetailSchema = jobSummarySchema.extend({
  myApplicationStatus: z.string().optional(), // set only for the current viewer, if they applied
});
export type JobDetail = z.infer<typeof jobDetailSchema>;
