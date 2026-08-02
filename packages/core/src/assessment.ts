import { z } from "zod";
import { trackSchema } from "./types.js";

/**
 * Assessment question kinds and their contract. This file is the source of
 * truth for: authoring payload shape, what gets sent to the client
 * (toSafePayload strips answer keys), how each kind is graded, how a
 * session's questions are chosen (buildSessionPlan), and how a session's
 * overall score is weighted (computeRawScore).
 */

export const QUESTION_KINDS = ["single_choice", "multi_choice", "short_answer", "code"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];
export const questionKindSchema = z.enum(QUESTION_KINDS);

export const CODE_LANGUAGES = ["python", "javascript", "typescript", "go", "java", "cpp"] as const;
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];
export const codeLanguageSchema = z.enum(CODE_LANGUAGES);

/* ── Per-kind payload schemas (author-facing — includes the answer key) ── */

export const singleChoicePayloadSchema = z
  .object({
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(10),
    correctIndex: z.number().int().min(0),
  })
  .refine((p) => p.correctIndex < p.options.length, { message: "correctIndex must index into options" });
export type SingleChoicePayload = z.infer<typeof singleChoicePayloadSchema>;

export const multiChoicePayloadSchema = z
  .object({
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(10),
    correctIndices: z.array(z.number().int().min(0)).min(1),
  })
  .refine((p) => p.correctIndices.every((i) => i < p.options.length), {
    message: "correctIndices must index into options",
  })
  .refine((p) => new Set(p.correctIndices).size === p.correctIndices.length, {
    message: "correctIndices must not contain duplicates",
  });
export type MultiChoicePayload = z.infer<typeof multiChoicePayloadSchema>;

export const shortAnswerPayloadSchema = z.object({
  acceptable: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  caseSensitive: z.boolean().optional(),
});
export type ShortAnswerPayload = z.infer<typeof shortAnswerPayloadSchema>;

export const testCaseSchema = z.object({ input: z.string(), expected: z.string() });
export type TestCase = z.infer<typeof testCaseSchema>;

export const codePayloadSchema = z.object({
  language: codeLanguageSchema.default("python"),
  starterCode: z.string().max(10000).optional(),
  /** Only used when JUDGE0_URL is configured. */
  hiddenTestCases: z.array(testCaseSchema).default([]),
  /** Dev-stub grading rubric — fraction of these keywords present in the
   *  submission. Used when !JUDGE0_URL (usingCodeGradingStub). */
  keywords: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
});
export type CodePayload = z.infer<typeof codePayloadSchema>;

/* ── Safe payload (client-facing — answer keys stripped) ── */

export type SafePayload = { options: string[] } | Record<string, never> | { language: CodeLanguage; starterCode?: string };

export function toSafePayload(kind: QuestionKind, payload: unknown): SafePayload {
  switch (kind) {
    case "single_choice":
    case "multi_choice": {
      const p = payload as SingleChoicePayload | MultiChoicePayload;
      return { options: p.options };
    }
    case "short_answer":
      return {};
    case "code": {
      const p = payload as CodePayload;
      return { language: p.language, starterCode: p.starterCode };
    }
  }
}

/* ── Grading ── */

export type SyncGradeResult = { correct: boolean; scoreFraction: number };

export function gradeSingleChoice(payload: SingleChoicePayload, response: unknown): SyncGradeResult {
  const chosen = (response as { selectedIndex?: number } | null | undefined)?.selectedIndex;
  const correct = chosen === payload.correctIndex;
  return { correct, scoreFraction: correct ? 1 : 0 };
}

/** Partial credit via Jaccard index — rewards partially-correct selections
 *  while penalizing false positives (ticking every option scores 0). */
export function gradeMultiChoice(payload: MultiChoicePayload, response: unknown): SyncGradeResult {
  const chosen = new Set((response as { selectedIndices?: number[] } | null | undefined)?.selectedIndices ?? []);
  const correctSet = new Set(payload.correctIndices);
  const intersection = [...chosen].filter((i) => correctSet.has(i)).length;
  const union = new Set([...chosen, ...correctSet]).size;
  const scoreFraction = union === 0 ? 0 : intersection / union;
  return { correct: scoreFraction === 1, scoreFraction };
}

export function gradeShortAnswer(payload: ShortAnswerPayload, response: unknown): SyncGradeResult {
  const raw = (response as { text?: string } | null | undefined)?.text ?? "";
  const normalize = (s: string) => (payload.caseSensitive ? s.trim() : s.trim().toLowerCase());
  const norm = normalize(raw);
  const correct = payload.acceptable.some((a) => normalize(a) === norm);
  return { correct, scoreFraction: correct ? 1 : 0 };
}

/** code is graded by Judge0 in a background worker (or the keyword stub,
 *  synchronously, when !JUDGE0_URL — see apps/api). */
export function isAsyncGraded(kind: QuestionKind): boolean {
  return kind === "code";
}

/** Returns null for code — caller must grade it via the stub or queue Judge0 instead. */
export function gradeSyncAnswer(kind: QuestionKind, payload: unknown, response: unknown): SyncGradeResult | null {
  switch (kind) {
    case "single_choice":
      return gradeSingleChoice(payload as SingleChoicePayload, response);
    case "multi_choice":
      return gradeMultiChoice(payload as MultiChoicePayload, response);
    case "short_answer":
      return gradeShortAnswer(payload as ShortAnswerPayload, response);
    case "code":
      return null;
  }
}

/* ── Session composition ── */

/** Default question mix per session (10 questions total). Gracefully shrinks
 *  when a track doesn't yet have enough of a kind seeded. */
export const ASSESSMENT_BLUEPRINT: Record<QuestionKind, number> = {
  single_choice: 4,
  multi_choice: 2,
  short_answer: 2,
  code: 2,
};

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/** Picks a randomized, blueprint-weighted set of question ids from a pool
 *  already grouped by kind. Pure — no DB access — fully unit-testable. */
export function buildSessionPlan(
  poolByKind: Partial<Record<QuestionKind, string[]>>,
  blueprint: Record<QuestionKind, number> = ASSESSMENT_BLUEPRINT,
  rng: () => number = Math.random,
): string[] {
  const selected: string[] = [];
  for (const kind of QUESTION_KINDS) {
    const pool = poolByKind[kind] ?? [];
    const count = blueprint[kind] ?? 0;
    selected.push(...shuffle(pool, rng).slice(0, count));
  }
  return shuffle(selected, rng);
}

/* ── Scoring ── */

/** Harder / higher-signal kinds count for more of the overall raw score. */
export const KIND_WEIGHTS: Record<QuestionKind, number> = {
  single_choice: 1,
  multi_choice: 1.25,
  short_answer: 1,
  code: 2,
};

/** Weighted average of already-graded answers. Ungraded (pending Judge0)
 *  answers must be excluded by the caller before calling this. */
export function computeRawScore(gradedAnswers: Array<{ kind: QuestionKind; scoreFraction: number }>): number {
  if (gradedAnswers.length === 0) return 0;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const a of gradedAnswers) {
    const w = KIND_WEIGHTS[a.kind];
    weightedSum += a.scoreFraction * w;
    weightTotal += w;
  }
  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

/* ── Bank authoring (tRPC input) ── */

const skillTagsField = z.array(z.string().trim().min(1).max(60)).max(10).default([]);

export const createBankQuestionInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("single_choice"),
    track: trackSchema,
    skillTags: skillTagsField,
    difficulty: z.number().int().min(1).max(5).default(1),
    prompt: z.string().trim().min(1).max(4000),
    payload: singleChoicePayloadSchema,
  }),
  z.object({
    kind: z.literal("multi_choice"),
    track: trackSchema,
    skillTags: skillTagsField,
    difficulty: z.number().int().min(1).max(5).default(1),
    prompt: z.string().trim().min(1).max(4000),
    payload: multiChoicePayloadSchema,
  }),
  z.object({
    kind: z.literal("short_answer"),
    track: trackSchema,
    skillTags: skillTagsField,
    difficulty: z.number().int().min(1).max(5).default(1),
    prompt: z.string().trim().min(1).max(4000),
    payload: shortAnswerPayloadSchema,
  }),
  z.object({
    kind: z.literal("code"),
    track: trackSchema,
    skillTags: skillTagsField,
    difficulty: z.number().int().min(1).max(5).default(1),
    prompt: z.string().trim().min(1).max(4000),
    payload: codePayloadSchema,
  }),
]);
export type CreateBankQuestionInput = z.infer<typeof createBankQuestionInput>;

export const updateBankQuestionInput = z.object({
  questionId: z.string().uuid(),
  active: z.boolean().optional(),
  prompt: z.string().trim().min(1).max(4000).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  skillTags: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
});
export type UpdateBankQuestionInput = z.infer<typeof updateBankQuestionInput>;

export const listBankQuestionsInput = z.object({
  track: trackSchema.optional(),
  skillTag: z.string().trim().max(60).optional(),
});
export type ListBankQuestionsInput = z.infer<typeof listBankQuestionsInput>;

export const bankQuestionSchema = z.object({
  id: z.string().uuid(),
  externalId: z.string().nullable(),
  track: trackSchema,
  skillTags: z.array(z.string()),
  kind: questionKindSchema,
  difficulty: z.number().int(),
  prompt: z.string(),
  payload: z.unknown(),
  active: z.boolean(),
  authorId: z.string().uuid(),
  createdAt: z.string(),
});
export type BankQuestion = z.infer<typeof bankQuestionSchema>;

/* ── Assessment definitions (tRPC input/output) ── */

export const createAssessmentInput = z.object({
  title: z.string().trim().min(1).max(200),
  track: trackSchema,
  layer: z.union([z.literal(1), z.literal(2)]).default(1),
  timeLimitSeconds: z
    .number()
    .int()
    .min(30)
    .max(4 * 60 * 60)
    .optional(),
  questionIds: z.array(z.string().uuid()).min(1).max(50),
  jobId: z.string().uuid().optional(),
});
export type CreateAssessmentInput = z.infer<typeof createAssessmentInput>;

export const assessmentSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  track: trackSchema,
  layer: z.number().int(),
  timeLimitSeconds: z.number().int().nullable(),
  questionCount: z.number().int().nonnegative(),
  jobId: z.string().uuid().nullable(),
  authorId: z.string().uuid(),
  authorName: z.string(),
  createdAt: z.string(),
});
export type AssessmentSummary = z.infer<typeof assessmentSummarySchema>;

/* ── Sessions (runner, tRPC input/output) ── */

export const startSessionInput = z.object({ assessmentId: z.string().uuid() });
export type StartSessionInput = z.infer<typeof startSessionInput>;

export const startSessionResultSchema = z.object({ sessionId: z.string().uuid(), resumed: z.boolean() });
export type StartSessionResult = z.infer<typeof startSessionResultSchema>;

export const getNextQuestionInput = z.object({ sessionId: z.string().uuid(), index: z.number().int().min(0) });
export type GetNextQuestionInput = z.infer<typeof getNextQuestionInput>;

export const nextQuestionResultSchema = z.discriminatedUnion("done", [
  z.object({ done: z.literal(true), total: z.number().int() }),
  z.object({
    done: z.literal(false),
    total: z.number().int(),
    index: z.number().int(),
    question: z.object({
      id: z.string().uuid(),
      kind: questionKindSchema,
      prompt: z.string(),
      payload: z.unknown(),
    }),
    expiresAt: z.string(),
  }),
]);
export type NextQuestionResult = z.infer<typeof nextQuestionResultSchema>;

export const answerResponseSchema = z.object({
  selectedIndex: z.number().int().optional(),
  selectedIndices: z.array(z.number().int()).optional(),
  text: z.string().max(20000).optional(),
  source: z.string().max(50000).optional(),
});
export type AnswerResponsePayload = z.infer<typeof answerResponseSchema>;

export const submitAnswerInput = z.object({
  sessionId: z.string().uuid(),
  questionId: z.string().uuid(),
  response: answerResponseSchema,
});
export type SubmitAnswerInput = z.infer<typeof submitAnswerInput>;

export const recordTelemetryInput = z.object({
  sessionId: z.string().uuid(),
  event: z.enum(["blur", "paste", "fullscreen-exit"]),
});
export type RecordTelemetryInput = z.infer<typeof recordTelemetryInput>;

export const submitSessionInput = z.object({ sessionId: z.string().uuid() });
export type SubmitSessionInput = z.infer<typeof submitSessionInput>;

export const submitSessionResultSchema = z.object({
  rawScore: z.number(),
  percentile: z.number(),
  pending: z.boolean(),
});
export type SubmitSessionResult = z.infer<typeof submitSessionResultSchema>;

export const trackResultHistoryItemSchema = z.object({
  sessionId: z.string().uuid(),
  assessmentId: z.string().uuid(),
  assessmentTitle: z.string(),
  track: trackSchema,
  rawScore: z.number(),
  percentile: z.number(),
  earnedAt: z.string(),
});
export type TrackResultHistoryItem = z.infer<typeof trackResultHistoryItemSchema>;
