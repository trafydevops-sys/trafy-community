import { z } from "zod";

export const batchStatusSchema = z.enum(["enrolled", "completed", "dropped"]);
export type BatchStatus = z.infer<typeof batchStatusSchema>;

export const createBatchInput = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(2).max(120),
  description: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  capacity: z.number().int().positive().optional(),
});
export type CreateBatchInput = z.infer<typeof createBatchInput>;

export const batchSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  capacity: z.number().int().nullable(),
  studentCount: z.number().int().nonnegative(),
  completionRate: z.number().min(0).max(100),
  placementRate: z.number().min(0).max(100),
  createdAt: z.string(),
});
export type Batch = z.infer<typeof batchSchema>;

export const enrollBatchInput = z.object({
  batchId: z.string().uuid(),
});
export type EnrollBatchInput = z.infer<typeof enrollBatchInput>;

export const placementRecordSchema = z.object({
  id: z.string().uuid(),
  batchId: z.string().uuid(),
  userId: z.string().uuid(),
  companyName: z.string(),
  role: z.string(),
  packageLpa: z.number().nullable(),
  placedAt: z.string(),
});
export type PlacementRecord = z.infer<typeof placementRecordSchema>;

export const addPlacementInput = z.object({
  batchId: z.string().uuid(),
  userId: z.string().uuid(),
  companyName: z.string().min(2),
  role: z.string().min(2),
  packageLpa: z.number().positive().optional(),
});
export type AddPlacementInput = z.infer<typeof addPlacementInput>;

export const placementStatsSchema = z.object({
  totalStudents: z.number().int().nonnegative(),
  placed: z.number().int().nonnegative(),
  placementRate: z.number().min(0).max(100),
  avgPackageLpa: z.number().nullable(),
  topCompanies: z.array(z.string()),
});
export type PlacementStats = z.infer<typeof placementStatsSchema>;

export const updateBatchStatusInput = z.object({
  batchId: z.string().uuid(),
  userId: z.string().uuid(),
  status: batchStatusSchema,
});
export type UpdateBatchStatusInput = z.infer<typeof updateBatchStatusInput>;
