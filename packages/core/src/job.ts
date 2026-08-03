import { z } from "zod";

export const jobTypeSchema = z.enum(["full_time", "contract", "freelance"]);
export type JobType = z.infer<typeof jobTypeSchema>;

export const compensationTypeSchema = z.enum(["salary", "hourly", "fixed"]);
export type CompensationType = z.infer<typeof compensationTypeSchema>;

export const JOB_TAGS = [
  "React",
  "Node.js",
  "Python",
  "TypeScript",
  "PostgreSQL",
  "AWS",
  "Design",
  "Marketing",
  "Sales",
  "Data Science",
  "DevOps",
  "Machine Learning",
  "Frontend",
  "Backend",
  "Fullstack"
] as const;

export const experienceLevelSchema = z.enum(["entry", "mid", "senior", "lead"]);
export type ExperienceLevel = z.infer<typeof experienceLevelSchema>;

export const createJobInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  jobType: jobTypeSchema.default("full_time"),
  compensationType: compensationTypeSchema.default("salary"),
  compensationMinCents: z.number().int().nonnegative().default(0),
  compensationMaxCents: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).default("usd"),
  location: z.string().trim().max(120).optional(),
  remote: z.boolean().default(false),
  experienceLevel: experienceLevelSchema.optional(),
  industry: z.string().max(80).optional(),
  organizationId: z.string().uuid().optional(),
  requiredTrack: z.string().optional(),
  minVerifiedScore: z.number().min(0).max(1).optional(),
  tags: z.array(z.string().refine(val => JOB_TAGS.includes(val as any), { message: "Invalid tag" })).max(10).optional(),
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
  location: z.string().nullable().optional(),
  remote: z.boolean().default(false),
  experienceLevel: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  organizationId: z.string().uuid().nullable().optional(),
  organizationName: z.string().nullable().optional(),
  requiredTrack: z.string().nullable().optional(),
  minVerifiedScore: z.number().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  savedByMe: z.boolean().default(false),
  meetsScoreGate: z.boolean().default(true),
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
  remote: z.boolean().optional(),
  location: z.string().optional(),
  experienceLevel: experienceLevelSchema.optional(),
  industry: z.string().optional(),
  organizationId: z.string().uuid().optional(),
  requiredTrack: z.string().optional(),
  minSalaryCents: z.number().int().nonnegative().optional(),
  maxSalaryCents: z.number().int().nonnegative().optional(),
  tags: z.array(z.string()).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type ListJobsInput = z.infer<typeof listJobsInput>;

export const jobAlertInput = z.object({
  query: z.string().optional(),
  jobType: jobTypeSchema.optional(),
  location: z.string().optional(),
  remote: z.boolean().optional(),
  experienceLevel: experienceLevelSchema.optional(),
  industry: z.string().optional(),
  track: z.string().optional(),
  minScore: z.number().min(0).max(1).optional(),
});
export type JobAlertInput = z.infer<typeof jobAlertInput>;

export const getJobInput = z.object({ jobId: z.string().uuid() });
export type GetJobInput = z.infer<typeof getJobInput>;

export const jobDetailSchema = jobSummarySchema.extend({
  myApplicationStatus: z.string().optional(), // set only for the current viewer, if they applied
});
export type JobDetail = z.infer<typeof jobDetailSchema>;
