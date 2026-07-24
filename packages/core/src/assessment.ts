import { z } from "zod";

export const questionKindSchema = z.enum(["single_choice", "multi_choice", "short_answer", "code"]);
export type QuestionKind = z.infer<typeof questionKindSchema>;

// Passing score is a fraction of the max (0..1); 0.6 = 60%.
export const createAssessmentInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  timeLimitSeconds: z.number().int().min(30).max(4 * 60 * 60).optional(),
  passingScore: z.number().min(0).max(1).default(0.6),
});
export type CreateAssessmentInput = z.infer<typeof createAssessmentInput>;

export const updateAssessmentInput = createAssessmentInput.partial().extend({
  assessmentId: z.string().uuid(),
});
export type UpdateAssessmentInput = z.infer<typeof updateAssessmentInput>;

export const setAssessmentPublishedInput = z.object({
  assessmentId: z.string().uuid(),
  published: z.boolean(),
});
export type SetAssessmentPublishedInput = z.infer<typeof setAssessmentPublishedInput>;

// One authoring input per kind (discriminated union). Answer keys live here and
// are stripped before questions are served to a candidate in a running attempt.
export const addQuestionInput = z.discriminatedUnion("kind", [
  z.object({
    assessmentId: z.string().uuid(),
    kind: z.literal("single_choice"),
    prompt: z.string().trim().min(1).max(4000),
    points: z.number().int().min(1).max(100).default(1),
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(10),
    correctIndex: z.number().int().min(0),
  }),
  z.object({
    assessmentId: z.string().uuid(),
    kind: z.literal("multi_choice"),
    prompt: z.string().trim().min(1).max(4000),
    points: z.number().int().min(1).max(100).default(1),
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(10),
    correctIndices: z.array(z.number().int().min(0)).min(1),
  }),
  z.object({
    assessmentId: z.string().uuid(),
    kind: z.literal("short_answer"),
    prompt: z.string().trim().min(1).max(4000),
    points: z.number().int().min(1).max(100).default(1),
    acceptable: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  }),
  z.object({
    assessmentId: z.string().uuid(),
    kind: z.literal("code"),
    prompt: z.string().trim().min(1).max(4000),
    points: z.number().int().min(1).max(100).default(1),
    language: z.string().trim().max(40).default("python"),
    starterCode: z.string().max(10000).optional(),
    // Stub grading rubric — fraction of these keywords present in the submission.
    // Replaced by Judge0 hidden-test-case execution when JUDGE0_URL is configured.
    keywords: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  }),
]);
export type AddQuestionInput = z.infer<typeof addQuestionInput>;

// --- Catalog / summaries ---

export const assessmentSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().optional(),
  timeLimitSeconds: z.number().int().nullable(),
  passingScore: z.number(),
  published: z.boolean(),
  authorId: z.string().uuid(),
  authorName: z.string(),
  questionCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type AssessmentSummary = z.infer<typeof assessmentSummarySchema>;

// A question as served to a candidate — answer keys removed.
export const runnerQuestionSchema = z.object({
  id: z.string().uuid(),
  kind: questionKindSchema,
  prompt: z.string(),
  points: z.number().int(),
  order: z.number().int(),
  options: z.array(z.string()).optional(), // choice kinds only
  language: z.string().optional(), // code only
  starterCode: z.string().optional(), // code only
});
export type RunnerQuestion = z.infer<typeof runnerQuestionSchema>;

// A question with its answer key — author-only (edit view).
export const authorQuestionSchema = runnerQuestionSchema.extend({
  answerKey: z.record(z.string(), z.unknown()),
});
export type AuthorQuestion = z.infer<typeof authorQuestionSchema>;

export const assessmentForEditSchema = assessmentSummarySchema.extend({
  questions: z.array(authorQuestionSchema),
});
export type AssessmentForEdit = z.infer<typeof assessmentForEditSchema>;

// --- Runner (taking an attempt) ---

export const startAttemptInput = z.object({ assessmentId: z.string().uuid() });
export type StartAttemptInput = z.infer<typeof startAttemptInput>;

export const attemptSchema = z.object({
  id: z.string().uuid(),
  assessmentId: z.string().uuid(),
  title: z.string(),
  timeLimitSeconds: z.number().int().nullable(),
  startedAt: z.string(),
  questions: z.array(runnerQuestionSchema),
});
export type Attempt = z.infer<typeof attemptSchema>;

// Loose per-question response — the grader reads the field relevant to the
// question's kind (selectedIndex / selectedIndices / text / source).
export const answerResponseSchema = z.object({
  questionId: z.string().uuid(),
  selectedIndex: z.number().int().optional(),
  selectedIndices: z.array(z.number().int()).optional(),
  text: z.string().max(20000).optional(),
  source: z.string().max(50000).optional(),
});
export type AnswerResponse = z.infer<typeof answerResponseSchema>;

export const submitAttemptInput = z.object({
  attemptId: z.string().uuid(),
  answers: z.array(answerResponseSchema),
});
export type SubmitAttemptInput = z.infer<typeof submitAttemptInput>;

export const gradedAnswerSchema = z.object({
  questionId: z.string().uuid(),
  prompt: z.string(),
  kind: questionKindSchema,
  points: z.number().int(),
  scoreFraction: z.number().min(0).max(1),
  awardedPoints: z.number(),
});
export type GradedAnswer = z.infer<typeof gradedAnswerSchema>;

export const attemptResultSchema = z.object({
  attemptId: z.string().uuid(),
  assessmentId: z.string().uuid(),
  title: z.string(),
  rawScore: z.number(),
  maxScore: z.number(),
  percent: z.number().int().min(0).max(100),
  passed: z.boolean(),
  passingScore: z.number(),
  submittedAt: z.string(),
  answers: z.array(gradedAnswerSchema),
});
export type AttemptResult = z.infer<typeof attemptResultSchema>;

export const attemptHistoryItemSchema = z.object({
  attemptId: z.string().uuid(),
  assessmentId: z.string().uuid(),
  title: z.string(),
  percent: z.number().int(),
  passed: z.boolean(),
  submittedAt: z.string(),
});
export type AttemptHistoryItem = z.infer<typeof attemptHistoryItemSchema>;
