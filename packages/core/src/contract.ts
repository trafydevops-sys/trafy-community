import { z } from "zod";

export const contractStatusSchema = z.enum(["active", "completed", "cancelled"]);
export type ContractStatus = z.infer<typeof contractStatusSchema>;

export const milestoneStatusSchema = z.enum(["pending", "funded", "released"]);
export type MilestoneStatus = z.infer<typeof milestoneStatusSchema>;

export const createMilestoneInput = z.object({
  title: z.string().trim().min(1).max(200),
  amountCents: z.number().int().positive(),
});
export type CreateMilestoneInput = z.infer<typeof createMilestoneInput>;

export const createContractInput = z.object({
  applicationId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  currency: z.string().length(3).default("usd"),
  milestones: z.array(createMilestoneInput).min(1).max(20),
});
export type CreateContractInput = z.infer<typeof createContractInput>;

export const contractIdInput = z.object({ contractId: z.string().uuid() });
export type ContractIdInput = z.infer<typeof contractIdInput>;

export const milestoneIdInput = z.object({ milestoneId: z.string().uuid() });
export type MilestoneIdInput = z.infer<typeof milestoneIdInput>;

export const milestoneSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  amountCents: z.number().int().nonnegative(),
  status: milestoneStatusSchema,
  order: z.number().int(),
  fundedAt: z.string().optional(),
  releasedAt: z.string().optional(),
});
export type Milestone = z.infer<typeof milestoneSchema>;

export const contractSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  jobTitle: z.string(),
  employerId: z.string().uuid(),
  employerName: z.string(),
  talentId: z.string().uuid(),
  talentName: z.string(),
  title: z.string(),
  currency: z.string(),
  status: contractStatusSchema,
  totalCents: z.number().int().nonnegative(),
  fundedCents: z.number().int().nonnegative(),
  releasedCents: z.number().int().nonnegative(),
  milestones: z.array(milestoneSchema),
  createdAt: z.string(),
});
export type Contract = z.infer<typeof contractSchema>;
