import { z } from "zod";
import { trackSchema } from "./types.js";

// ─── Rubric ─────────────────────────────────────────────────────────
export const RUBRIC_DIMENSIONS = ["correctness", "structure", "tests", "documentation"] as const;
export type RubricDimension = typeof RUBRIC_DIMENSIONS[number];

export const rubricWeightsSchema = z
  .object({
    correctness: z.number().min(0).max(1).default(0.3),
    structure: z.number().min(0).max(1).default(0.25),
    tests: z.number().min(0).max(1).default(0.25),
    documentation: z.number().min(0).max(1).default(0.2),
  })
  .refine(
    (d) => {
      const sum = d.correctness + d.structure + d.tests + d.documentation;
      return Math.abs(sum - 1) < 0.01;
    },
    { message: "Rubric weights must sum to 1.0" }
  );

export type RubricWeights = z.infer<typeof rubricWeightsSchema>;

// ─── Mission CRUD ───────────────────────────────────────────────────
export const createMissionInput = z.object({
  title: z.string().trim().min(1).max(200),
  track: trackSchema,
  briefMarkdown: z.string().min(10).max(50000),
  starterRepoUrl: z.string().url().optional(),
  timeLimitHours: z.number().int().min(4).max(72).default(24),
  rubricWeights: rubricWeightsSchema.optional(),
  buildCommand: z.string().max(500).optional(),
  testCommand: z.string().max(500).optional(),
  metricName: z.string().max(80).optional(),
  metricThreshold: z.number().optional(),
});
export type CreateMissionInput = z.infer<typeof createMissionInput>;

// ─── Submission ─────────────────────────────────────────────────────
export const startMissionInput = z.object({ missionId: z.string().uuid() });
export type StartMissionInput = z.infer<typeof startMissionInput>;

export const submitMissionInput = z.object({
  submissionId: z.string().uuid(),
  repoUrl: z
    .string()
    .url()
    .refine((u) => u.includes("github.com"), {
      message: "Must be a GitHub repository URL",
    }),
  writeup: z.string().max(20000).optional(),
});
export type SubmitMissionInput = z.infer<typeof submitMissionInput>;

export const buildSubmissionStatusSchema = z.enum([
  "active",
  "submitted",
  "harness_running",
  "harness_done",
  "graded",
  "expired",
]);
export type BuildSubmissionStatus = z.infer<typeof buildSubmissionStatusSchema>;

export const buildSubmissionSchema = z.object({
  id: z.string().uuid(),
  missionId: z.string().uuid(),
  missionTitle: z.string(),
  track: trackSchema,
  status: buildSubmissionStatusSchema,
  startedAt: z.string(),
  expiresAt: z.string(),
  repoUrl: z.string().nullable().optional(),
  writeup: z.string().nullable().optional(),
  submittedAt: z.string().nullable().optional(),
  // Machine harness
  buildPassed: z.boolean().nullable().optional(),
  testsPassed: z.boolean().nullable().optional(),
  testOutput: z.string().nullable().optional(),
  metricValue: z.number().nullable().optional(),
  machineScore: z.number().nullable().optional(),
  // Rubric
  correctnessScore: z.number().nullable().optional(),
  structureScore: z.number().nullable().optional(),
  testsScore: z.number().nullable().optional(),
  documentationScore: z.number().nullable().optional(),
  rubricAvg: z.number().nullable().optional(),
  // Final
  rawScore: z.number().nullable().optional(),
  reviewerId: z.string().uuid().nullable().optional(),
  reviewedAt: z.string().nullable().optional(),
});
export type BuildSubmission = z.infer<typeof buildSubmissionSchema>;

// ─── Grading (reviewer) ─────────────────────────────────────────────
export const gradeMissionInput = z.object({
  submissionId: z.string().uuid(),
  correctnessScore: z.number().int().min(0).max(5),
  structureScore: z.number().int().min(0).max(5),
  testsScore: z.number().int().min(0).max(5),
  documentationScore: z.number().int().min(0).max(5),
});
export type GradeMissionInput = z.infer<typeof gradeMissionInput>;

// ─── Mission summary (for listing) ─────────────────────────────────
export const missionSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  track: trackSchema,
  timeLimitHours: z.number().int(),
  published: z.boolean(),
  submissionCount: z.number().int(),
  authorName: z.string(),
  createdAt: z.string(),
});
export type MissionSummary = z.infer<typeof missionSummarySchema>;
