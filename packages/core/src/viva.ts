import { z } from "zod";
import { trackSchema } from "./types.js";

// ─── Question schema ────────────────────────────────────────────────
export const vivaQuestionSchema = z.object({
  prompt: z.string(), // The question text
  category: z.enum(['code_decision', 'architecture', 'edge_case', 'improvement', 'concept']),
  targetFile: z.string().optional(), // which file in the repo this question targets
  difficulty: z.enum(['standard', 'probing', 'challenge']),
});
export type VivaQuestion = z.infer<typeof vivaQuestionSchema>;

// ─── Viva status ────────────────────────────────────────────────────
export const vivaStatusSchema = z.enum([
  'generating_questions', 'questions_ready', 'recording',
  'transcribing', 'llm_grading', 'pending_review',
  'approved', 'rejected',
]);
export type VivaStatus = z.infer<typeof vivaStatusSchema>;

// ─── Exam schema (candidate view) ──────────────────────────────────
export const vivaExamSchema = z.object({
  id: z.string().uuid(),
  submissionId: z.string().uuid(),
  missionTitle: z.string(),
  track: trackSchema,
  status: vivaStatusSchema,
  questions: z.array(vivaQuestionSchema).optional(), // hidden until status='questions_ready'
  expiresAt: z.string(),
  startedAt: z.string().nullable().optional(),
  answeredCount: z.number().int(),
  totalQuestions: z.number().int(),
  rawScore: z.number().nullable().optional(), // only after 'approved'
});
export type VivaExam = z.infer<typeof vivaExamSchema>;

// ─── Answer submission ──────────────────────────────────────────────
export const submitVivaAnswerInput = z.object({
  vivaId: z.string().uuid(),
  questionIndex: z.number().int().min(0),
  videoUrl: z.string().url(),
  videoSeconds: z.number().int().min(1).max(300), // max 5 min per answer (per user request)
});
export type SubmitVivaAnswerInput = z.infer<typeof submitVivaAnswerInput>;

// ─── LLM grading result (per-answer) ────────────────────────────────
export const vivaAnswerGradeSchema = z.object({
  clarityScore: z.number().int().min(0).max(5),
  depthScore: z.number().int().min(0).max(5),
  accuracyScore: z.number().int().min(0).max(5),
  confidence: z.enum(['high', 'medium', 'low']),
  rationale: z.string(),
});
export type VivaAnswerGrade = z.infer<typeof vivaAnswerGradeSchema>;

// ─── Reviewer actions ───────────────────────────────────────────────
export const reviewVivaInput = z.object({
  vivaId: z.string().uuid(),
  action: z.enum(['approve', 'override', 'reject']),
  overrideScore: z.number().min(0).max(1).optional(), // required if action='override'
  notes: z.string().max(5000).optional(),
  answerOverrides: z.array(z.object({
    questionIndex: z.number().int(),
    overrideScore: z.number().min(0).max(1),
  })).optional(),
}).refine(
  d => d.action !== 'override' || (d.overrideScore !== undefined && d.overrideScore !== null),
  { message: 'overrideScore is required when action is override' }
);
export type ReviewVivaInput = z.infer<typeof reviewVivaInput>;

// ─── Reviewer listing ───────────────────────────────────────────────
export const vivaReviewItemSchema = z.object({
  vivaId: z.string().uuid(),
  candidateName: z.string(),
  missionTitle: z.string(),
  track: trackSchema,
  status: vivaStatusSchema,
  llmRawScore: z.number().nullable(),
  llmConfidence: z.string().nullable(),
  flaggedAnswers: z.number().int(), // count of low-confidence answers
  submittedAt: z.string().nullable(),
});
export type VivaReviewItem = z.infer<typeof vivaReviewItemSchema>;
