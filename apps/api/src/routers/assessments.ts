import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, ilike, isNotNull, or } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@trafy-community/db";
import {
  addQuestionInput,
  createAssessmentInput,
  setAssessmentPublishedInput,
  startAttemptInput,
  submitAttemptInput,
  updateAssessmentInput,
  type AnswerResponse,
  type AssessmentForEdit,
  type AssessmentSummary,
  type Attempt,
  type AttemptResult,
  type AuthorQuestion,
  type GradedAnswer,
  type QuestionKind,
  type RunnerQuestion,
} from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";
import { gradeAnswer } from "../lib/grading.js";

async function authorName(userId: string): Promise<string> {
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1);
  return profile?.fullName || "";
}

async function questionCount(assessmentId: string): Promise<number> {
  const rows = await db
    .select({ id: schema.assessmentQuestions.id })
    .from(schema.assessmentQuestions)
    .where(eq(schema.assessmentQuestions.assessmentId, assessmentId));
  return rows.length;
}

async function toSummary(row: typeof schema.assessments.$inferSelect): Promise<AssessmentSummary> {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    timeLimitSeconds: row.timeLimitSeconds,
    passingScore: row.passingScore,
    published: row.published,
    authorId: row.authorId,
    authorName: await authorName(row.authorId),
    questionCount: await questionCount(row.id),
    createdAt: row.createdAt.toISOString(),
  };
}

function toRunnerQuestion(row: typeof schema.assessmentQuestions.$inferSelect): RunnerQuestion {
  const kind = row.kind as QuestionKind;
  const isChoice = kind === "single_choice" || kind === "multi_choice";
  return {
    id: row.id,
    kind,
    prompt: row.prompt,
    points: row.points,
    order: row.order,
    options: isChoice ? (row.options as string[]) : undefined,
    language: kind === "code" ? (row.language ?? undefined) : undefined,
    starterCode: kind === "code" ? (row.starterCode ?? undefined) : undefined,
  };
}

async function assertAuthor(assessmentId: string, userId: string) {
  const [row] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, assessmentId)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  if (row.authorId !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "Not your assessment." });
  return row;
}

export const assessmentsRouter = router({
  // --- authoring ---

  create: protectedProcedure.input(createAssessmentInput).mutation(async ({ ctx, input }) => {
    const [row] = await db
      .insert(schema.assessments)
      .values({
        authorId: ctx.user.sub,
        title: input.title,
        description: input.description,
        timeLimitSeconds: input.timeLimitSeconds,
        passingScore: input.passingScore,
      })
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return toSummary(row);
  }),

  update: protectedProcedure.input(updateAssessmentInput).mutation(async ({ ctx, input }) => {
    const { assessmentId, ...rest } = input;
    await assertAuthor(assessmentId, ctx.user.sub);
    const [row] = await db
      .update(schema.assessments)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(schema.assessments.id, assessmentId))
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return toSummary(row);
  }),

  setPublished: protectedProcedure.input(setAssessmentPublishedInput).mutation(async ({ ctx, input }) => {
    await assertAuthor(input.assessmentId, ctx.user.sub);
    const [row] = await db
      .update(schema.assessments)
      .set({ published: input.published, updatedAt: new Date() })
      .where(eq(schema.assessments.id, input.assessmentId))
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return toSummary(row);
  }),

  addQuestion: protectedProcedure.input(addQuestionInput).mutation(async ({ ctx, input }) => {
    await assertAuthor(input.assessmentId, ctx.user.sub);

    const existing = await questionCount(input.assessmentId);

    // Map each kind onto the shared column layout (options + answerKey jsonb).
    let options: string[] = [];
    let answerKey: Record<string, unknown> = {};
    let language: string | undefined;
    let starterCode: string | undefined;

    switch (input.kind) {
      case "single_choice":
        options = input.options;
        answerKey = { correctIndex: input.correctIndex };
        break;
      case "multi_choice":
        options = input.options;
        answerKey = { correctIndices: input.correctIndices };
        break;
      case "short_answer":
        answerKey = { acceptable: input.acceptable };
        break;
      case "code":
        answerKey = { keywords: input.keywords };
        language = input.language;
        starterCode = input.starterCode;
        break;
    }

    const [row] = await db
      .insert(schema.assessmentQuestions)
      .values({
        assessmentId: input.assessmentId,
        kind: input.kind,
        prompt: input.prompt,
        points: input.points,
        options,
        answerKey,
        language,
        starterCode,
        order: existing,
      })
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return { id: row.id };
  }),

  listMine: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select().from(schema.assessments).where(eq(schema.assessments.authorId, ctx.user.sub));
    return Promise.all(rows.map(toSummary));
  }),

  getForEdit: protectedProcedure.input(z.object({ assessmentId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const row = await assertAuthor(input.assessmentId, ctx.user.sub);
    const questionRows = await db
      .select()
      .from(schema.assessmentQuestions)
      .where(eq(schema.assessmentQuestions.assessmentId, input.assessmentId))
      .orderBy(asc(schema.assessmentQuestions.order));

    const questions: AuthorQuestion[] = questionRows.map((q) => ({
      ...toRunnerQuestion(q),
      answerKey: q.answerKey as Record<string, unknown>,
    }));

    const summary = await toSummary(row);
    const forEdit: AssessmentForEdit = { ...summary, questions };
    return forEdit;
  }),

  // --- catalog ---

  listPublished: protectedProcedure
    .input(z.object({ query: z.string().trim().max(200).optional() }))
    .query(async ({ input }) => {
      const whereCondition = input.query
        ? and(
            eq(schema.assessments.published, true),
            or(ilike(schema.assessments.title, `%${input.query}%`), ilike(schema.assessments.description, `%${input.query}%`))
          )
        : eq(schema.assessments.published, true);

      const rows = await db.select().from(schema.assessments).where(whereCondition);
      return Promise.all(rows.map(toSummary));
    }),

  // --- runner ---

  startAttempt: protectedProcedure.input(startAttemptInput).mutation(async ({ ctx, input }) => {
    const [assessment] = await db
      .select()
      .from(schema.assessments)
      .where(eq(schema.assessments.id, input.assessmentId))
      .limit(1);
    if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });
    if (!assessment.published && assessment.authorId !== ctx.user.sub) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    const questionRows = await db
      .select()
      .from(schema.assessmentQuestions)
      .where(eq(schema.assessmentQuestions.assessmentId, assessment.id))
      .orderBy(asc(schema.assessmentQuestions.order));
    if (questionRows.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This assessment has no questions yet." });
    }

    const [attempt] = await db
      .insert(schema.assessmentAttempts)
      .values({ assessmentId: assessment.id, userId: ctx.user.sub })
      .returning();
    if (!attempt) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const result: Attempt = {
      id: attempt.id,
      assessmentId: assessment.id,
      title: assessment.title,
      timeLimitSeconds: assessment.timeLimitSeconds,
      startedAt: attempt.startedAt.toISOString(),
      questions: questionRows.map(toRunnerQuestion), // answer keys stripped
    };
    return result;
  }),

  submitAttempt: protectedProcedure.input(submitAttemptInput).mutation(async ({ ctx, input }) => {
    const [attempt] = await db
      .select()
      .from(schema.assessmentAttempts)
      .where(eq(schema.assessmentAttempts.id, input.attemptId))
      .limit(1);
    if (!attempt || attempt.userId !== ctx.user.sub) throw new TRPCError({ code: "NOT_FOUND" });
    if (attempt.submittedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "This attempt was already submitted." });

    const [assessment] = await db
      .select()
      .from(schema.assessments)
      .where(eq(schema.assessments.id, attempt.assessmentId))
      .limit(1);
    if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });

    const questionRows = await db
      .select()
      .from(schema.assessmentQuestions)
      .where(eq(schema.assessmentQuestions.assessmentId, attempt.assessmentId))
      .orderBy(asc(schema.assessmentQuestions.order));

    const responseByQuestion = new Map<string, AnswerResponse>();
    for (const answer of input.answers) responseByQuestion.set(answer.questionId, answer);

    let rawScore = 0;
    let maxScore = 0;
    const gradedAnswers: GradedAnswer[] = [];

    for (const q of questionRows) {
      const response = responseByQuestion.get(q.id);
      const fraction = gradeAnswer({ kind: q.kind as QuestionKind, answerKey: q.answerKey, points: q.points }, response);
      const awarded = fraction * q.points;
      rawScore += awarded;
      maxScore += q.points;

      await db
        .insert(schema.attemptAnswers)
        .values({ attemptId: attempt.id, questionId: q.id, response: response ?? {}, scoreFraction: fraction })
        .onConflictDoUpdate({
          target: [schema.attemptAnswers.attemptId, schema.attemptAnswers.questionId],
          set: { response: response ?? {}, scoreFraction: fraction, gradedAt: new Date() },
        });

      gradedAnswers.push({
        questionId: q.id,
        prompt: q.prompt,
        kind: q.kind as QuestionKind,
        points: q.points,
        scoreFraction: fraction,
        awardedPoints: Math.round(awarded * 100) / 100,
      });
    }

    const percent = maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0;
    const passed = maxScore > 0 && rawScore / maxScore >= assessment.passingScore;
    const submittedAt = new Date();

    await db
      .update(schema.assessmentAttempts)
      .set({ rawScore, maxScore, passed, submittedAt })
      .where(eq(schema.assessmentAttempts.id, attempt.id));

    const result: AttemptResult = {
      attemptId: attempt.id,
      assessmentId: assessment.id,
      title: assessment.title,
      rawScore: Math.round(rawScore * 100) / 100,
      maxScore,
      percent,
      passed,
      passingScore: assessment.passingScore,
      submittedAt: submittedAt.toISOString(),
      answers: gradedAnswers,
    };
    return result;
  }),

  myAttempts: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(schema.assessmentAttempts)
      .where(and(eq(schema.assessmentAttempts.userId, ctx.user.sub), isNotNull(schema.assessmentAttempts.submittedAt)))
      .orderBy(desc(schema.assessmentAttempts.submittedAt));

    return Promise.all(
      rows.map(async (a) => {
        const [assessment] = await db
          .select()
          .from(schema.assessments)
          .where(eq(schema.assessments.id, a.assessmentId))
          .limit(1);
        const percent = a.maxScore && a.maxScore > 0 ? Math.round(((a.rawScore ?? 0) / a.maxScore) * 100) : 0;
        return {
          attemptId: a.id,
          assessmentId: a.assessmentId,
          title: assessment?.title || "",
          percent,
          passed: Boolean(a.passed),
          submittedAt: (a.submittedAt ?? a.startedAt).toISOString(),
        };
      })
    );
  }),
});
