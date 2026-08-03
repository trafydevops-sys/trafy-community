import { z } from "zod";

// ─── Funnel ─────────────────────────────────────────────────────────
export const funnelAnalyticsInput = z.object({
  jobId: z.string().uuid().optional(),         // scope to single job, or all jobs
  dateFrom: z.string().datetime().optional(),   // time window
  dateTo: z.string().datetime().optional(),
});
export const funnelStageSchema = z.object({
  stage: z.string(),
  count: z.number().int().nonnegative(),
  conversionRate: z.number().min(0).max(1),    // % that progressed from previous stage
});
export const funnelAnalyticsOutput = z.object({
  stages: z.array(funnelStageSchema),
  totalApplications: z.number().int().nonnegative(),
  overallHireRate: z.number().min(0).max(1),    // hired / total
});

// ─── Time to Hire ───────────────────────────────────────────────────
export const timeToHireInput = funnelAnalyticsInput;  // same filters
export const stageDurationSchema = z.object({
  stage: z.string(),
  medianDays: z.number(),
  avgDays: z.number(),
  p90Days: z.number(),
});
export const timeToHireOutput = z.object({
  medianDaysToHire: z.number(),
  avgDaysToHire: z.number(),
  offerAcceptanceRate: z.number().min(0).max(1),
  stageDurations: z.array(stageDurationSchema),
  trend: z.array(z.object({
    month: z.string(),         // 'YYYY-MM'
    medianDays: z.number(),
    hireCount: z.number(),
  })),
});

// ─── Assessment Drop-off ────────────────────────────────────────────
export const assessmentDropoffInput = z.object({
  track: z.string().optional(),
  layer: z.number().int().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});
export const dropoffBucketSchema = z.object({
  track: z.string(),
  layer: z.number().int(),
  started: z.number().int(),
  submitted: z.number().int(),
  graded: z.number().int(),
  dropoffRate: z.number().min(0).max(1),   // 1 - (submitted / started)
  avgScore: z.number().optional(),
});
export const assessmentDropoffOutput = z.object({
  buckets: z.array(dropoffBucketSchema),
  overallDropoffRate: z.number().min(0).max(1),
});

// ─── Score vs Outcome ───────────────────────────────────────────────
export const scoreOutcomeInput = z.object({
  track: z.string().optional(),
  jobId: z.string().uuid().optional(),
});
export const scoreOutcomePointSchema = z.object({
  userId: z.string().uuid(),
  rawScore: z.number(),
  percentile: z.number(),
  outcome: z.enum(["hired", "rejected", "open"]),
  track: z.string(),
});
export const scoreOutcomeOutput = z.object({
  points: z.array(scoreOutcomePointSchema),
  correlation: z.number(),                  // Pearson r between score and hire (1=perfect, 0=none)
  avgScoreHired: z.number().optional(),
  avgScoreRejected: z.number().optional(),
});
