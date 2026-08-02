import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import {
  buildSessionPlan,
  computeRawScore,
  createAssessmentInput,
  createBankQuestionInput,
  getNextQuestionInput,
  gradeSyncAnswer,
  isAsyncGraded,
  listBankQuestionsInput,
  percentileOf,
  recordTelemetryInput,
  startSessionInput,
  submitAnswerInput,
  submitSessionInput,
  toSafePayload,
  updateBankQuestionInput,
  type AssessmentSummary,
  type BankQuestion,
  type NextQuestionResult,
  type QuestionKind,
  type StartSessionResult,
  type SubmitSessionResult,
  type TrackResultHistoryItem,
} from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";
import { gradeCodeStub } from "../lib/grading.js";
import { usingCodeGradingStub } from "../lib/env.js";
import { getQueues, tryEnqueue } from "../lib/queue.js";
import { emitIntegrityFlag, emitSessionAnswerGraded, emitSessionGraded } from "../lib/realtime.js";

const SESSION_MINUTES = 45;
const INTEGRITY_FLAG_THRESHOLD = 3; // flag on the 3rd+ tab-blur/paste

async function authorName(userId: string): Promise<string> {
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1);
  return profile?.fullName || "";
}

function toBankQuestion(row: typeof schema.questionBank.$inferSelect): BankQuestion {
  return {
    id: row.id,
    externalId: row.externalId,
    track: row.track as BankQuestion["track"],
    skillTags: row.skillTags as string[],
    kind: row.kind as QuestionKind,
    difficulty: row.difficulty,
    prompt: row.prompt,
    payload: row.payload,
    active: row.active,
    authorId: row.authorId,
    createdAt: row.createdAt.toISOString(),
  };
}

async function toAssessmentSummary(row: typeof schema.assessments.$inferSelect): Promise<AssessmentSummary> {
  return {
    id: row.id,
    title: row.title,
    track: row.track as AssessmentSummary["track"],
    layer: row.layer,
    timeLimitSeconds: row.timeLimitSeconds,
    questionCount: (row.questionIds as string[]).length,
    jobId: row.jobId,
    authorId: row.authorId,
    authorName: await authorName(row.authorId),
    createdAt: row.createdAt.toISOString(),
  };
}

async function requireOwnActiveSession(sessionId: string, userId: string) {
  const [session] = await db
    .select()
    .from(schema.assessmentSessions)
    .where(eq(schema.assessmentSessions.id, sessionId))
    .limit(1);
  if (!session || session.userId !== userId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
  }
  if (session.status !== "active") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Session is not active." });
  }
  if (session.expiresAt <= new Date()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Session expired." });
  }
  return session;
}

export const assessmentsRouter = router({
  bank: router({
    create: protectedProcedure.input(createBankQuestionInput).mutation(async ({ ctx, input }) => {
      const { kind, track, skillTags, difficulty, prompt, payload } = input;
      const [row] = await db
        .insert(schema.questionBank)
        .values({ authorId: ctx.user.sub, kind, track, skillTags, difficulty, prompt, payload })
        .returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toBankQuestion(row);
    }),

    update: protectedProcedure.input(updateBankQuestionInput).mutation(async ({ ctx, input }) => {
      const { questionId, ...rest } = input;
      const [existing] = await db.select().from(schema.questionBank).where(eq(schema.questionBank.id, questionId)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (existing.authorId !== ctx.user.sub) throw new TRPCError({ code: "FORBIDDEN", message: "Not your question." });
      const [row] = await db
        .update(schema.questionBank)
        .set({ ...rest, updatedAt: new Date() })
        .where(eq(schema.questionBank.id, questionId))
        .returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toBankQuestion(row);
    }),

    list: protectedProcedure.input(listBankQuestionsInput).query(async ({ input }) => {
      const conditions = [eq(schema.questionBank.active, true)];
      if (input.track) conditions.push(eq(schema.questionBank.track, input.track));
      const rows = await db.select().from(schema.questionBank).where(and(...conditions));
      const filtered = input.skillTag ? rows.filter((r) => (r.skillTags as string[]).includes(input.skillTag!)) : rows;
      return filtered.map(toBankQuestion);
    }),
  }),

  create: protectedProcedure.input(createAssessmentInput).mutation(async ({ ctx, input }) => {
    const questionRows = await db
      .select({ id: schema.questionBank.id })
      .from(schema.questionBank)
      .where(inArray(schema.questionBank.id, input.questionIds));
    if (questionRows.length !== input.questionIds.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "One or more question ids don't exist." });
    }
    const [row] = await db
      .insert(schema.assessments)
      .values({
        title: input.title,
        track: input.track,
        layer: input.layer,
        timeLimitSeconds: input.timeLimitSeconds,
        questionIds: input.questionIds,
        jobId: input.jobId,
        authorId: ctx.user.sub,
      })
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return toAssessmentSummary(row);
  }),

  startSession: protectedProcedure.input(startSessionInput).mutation(async ({ ctx, input }) => {
    const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, input.assessmentId)).limit(1);
    if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });

    const [existing] = await db
      .select()
      .from(schema.assessmentSessions)
      .where(
        and(
          eq(schema.assessmentSessions.userId, ctx.user.sub),
          eq(schema.assessmentSessions.assessmentId, assessment.id),
          eq(schema.assessmentSessions.status, "active"),
        ),
      )
      .limit(1);
    if (existing) {
      if (existing.expiresAt > new Date()) {
        const result: StartSessionResult = { sessionId: existing.id, resumed: true };
        return result;
      }
      await db
        .update(schema.assessmentSessions)
        .set({ status: "expired" })
        .where(eq(schema.assessmentSessions.id, existing.id));
    }

    const durationMs = (assessment.timeLimitSeconds ?? SESSION_MINUTES * 60) * 1000;
    const [session] = await db
      .insert(schema.assessmentSessions)
      .values({ assessmentId: assessment.id, userId: ctx.user.sub, expiresAt: new Date(Date.now() + durationMs) })
      .returning();
    if (!session) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const result: StartSessionResult = { sessionId: session.id, resumed: false };
    return result;
  }),

  getNextQuestion: protectedProcedure.input(getNextQuestionInput).query(async ({ ctx, input }) => {
    const session = await requireOwnActiveSession(input.sessionId, ctx.user.sub);
    const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, session.assessmentId)).limit(1);
    if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });

    const questionIds = assessment.questionIds as string[];
    const qid = questionIds[input.index];
    if (!qid) {
      const result: NextQuestionResult = { done: true, total: questionIds.length };
      return result;
    }

    const [q] = await db.select().from(schema.questionBank).where(eq(schema.questionBank.id, qid)).limit(1);
    if (!q) throw new TRPCError({ code: "NOT_FOUND" });

    const result: NextQuestionResult = {
      done: false,
      total: questionIds.length,
      index: input.index,
      question: {
        id: q.id,
        kind: q.kind as QuestionKind,
        prompt: q.prompt,
        payload: toSafePayload(q.kind as QuestionKind, q.payload),
      },
      expiresAt: session.expiresAt.toISOString(),
    };
    return result;
  }),

  submitAnswer: protectedProcedure.input(submitAnswerInput).mutation(async ({ ctx, input }) => {
    const session = await requireOwnActiveSession(input.sessionId, ctx.user.sub);
    const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, session.assessmentId)).limit(1);
    if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });
    if (!(assessment.questionIds as string[]).includes(input.questionId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Question not in this session." });
    }
    const [q] = await db.select().from(schema.questionBank).where(eq(schema.questionBank.id, input.questionId)).limit(1);
    if (!q) throw new TRPCError({ code: "NOT_FOUND" });

    const kind = q.kind as QuestionKind;

    // Upsert on the (sessionId, questionId) unique constraint — atomic, so two
    // concurrent submitAnswer calls for the same question can't race into a
    // duplicate-key error the way a manual select-then-insert-or-update would.
    async function upsertAnswer(fields: {
      correct: boolean | null;
      scoreFraction: number | null;
      gradedAt: Date | null;
    }): Promise<string> {
      const [row] = await db
        .insert(schema.answers)
        .values({ sessionId: input.sessionId, questionId: input.questionId, response: input.response, ...fields })
        .onConflictDoUpdate({
          target: [schema.answers.sessionId, schema.answers.questionId],
          set: { response: input.response, ...fields },
        })
        .returning({ id: schema.answers.id });
      return row!.id;
    }

    if (isAsyncGraded(kind)) {
      if (usingCodeGradingStub) {
        // No JUDGE0_URL — grade synchronously via the keyword-rubric stub so
        // local dev without Docker's Judge0 profile still works end-to-end.
        const fraction = gradeCodeStub(q.payload as { keywords: string[] }, input.response.source ?? "");
        await upsertAnswer({ correct: fraction === 1, scoreFraction: fraction, gradedAt: new Date() });
        emitSessionAnswerGraded(input.sessionId, { questionId: input.questionId, scoreFraction: fraction });
        return { ok: true, pending: false };
      }

      // Real Judge0 configured — save the response ungraded and enqueue.
      const answerId = await upsertAnswer({ correct: null, scoreFraction: null, gradedAt: null });
      await tryEnqueue(
        getQueues().gradeCode.add("grade", { answerId, sessionId: input.sessionId }),
        `grade-code (answer ${answerId})`,
      );
      return { ok: true, pending: true };
    }

    // Sync-gradable kinds.
    const result = gradeSyncAnswer(kind, q.payload, input.response);
    if (!result) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await upsertAnswer({ correct: result.correct, scoreFraction: result.scoreFraction, gradedAt: new Date() });
    emitSessionAnswerGraded(input.sessionId, { questionId: input.questionId, scoreFraction: result.scoreFraction });
    return { ok: true, pending: false };
  }),

  recordTelemetry: protectedProcedure.input(recordTelemetryInput).mutation(async ({ ctx, input }) => {
    const session = await requireOwnActiveSession(input.sessionId, ctx.user.sub);
    const telemetry = { ...(session.telemetry as Record<string, number>) };
    telemetry[input.event] = (telemetry[input.event] ?? 0) + 1;
    await db.update(schema.assessmentSessions).set({ telemetry }).where(eq(schema.assessmentSessions.id, session.id));

    if ((input.event === "blur" || input.event === "paste") && telemetry[input.event]! >= INTEGRITY_FLAG_THRESHOLD) {
      emitIntegrityFlag(session.assessmentId, {
        sessionId: session.id,
        userId: ctx.user.sub,
        event: input.event,
        count: telemetry[input.event]!,
      });
    }
    return { ok: true };
  }),

  submitSession: protectedProcedure.input(submitSessionInput).mutation(async ({ ctx, input }) => {
    const session = await requireOwnActiveSession(input.sessionId, ctx.user.sub);
    const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, session.assessmentId)).limit(1);
    if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });

    const questionRows = await db
      .select()
      .from(schema.questionBank)
      .where(inArray(schema.questionBank.id, assessment.questionIds as string[]));
    const kindById = new Map(questionRows.map((q) => [q.id, q.kind as QuestionKind]));

    const answerRows = await db.select().from(schema.answers).where(eq(schema.answers.sessionId, session.id));
    const graded = answerRows.filter((a) => a.gradedAt !== null);
    const pending = answerRows.some((a) => a.gradedAt === null);

    const rawScore = computeRawScore(graded.map((a) => ({ kind: kindById.get(a.questionId)!, scoreFraction: a.scoreFraction ?? 0 })));

    const cohort = await db
      .select({ rawScore: schema.trackResults.rawScore })
      .from(schema.trackResults)
      .where(and(eq(schema.trackResults.track, assessment.track), ne(schema.trackResults.userId, ctx.user.sub)));
    const percentile = percentileOf(rawScore, cohort.map((c) => c.rawScore));

    await db
      .update(schema.assessmentSessions)
      .set({ status: pending ? "submitted" : "graded", submittedAt: new Date() })
      .where(eq(schema.assessmentSessions.id, session.id));
    await db
      .insert(schema.trackResults)
      .values({ userId: ctx.user.sub, sessionId: session.id, track: assessment.track, rawScore, percentile });

    if (!pending) emitSessionGraded(session.id, { rawScore, percentile });

    const result: SubmitSessionResult = { rawScore, percentile, pending };
    return result;
  }),

  myHistory: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        sessionId: schema.trackResults.sessionId,
        assessmentId: schema.assessmentSessions.assessmentId,
        track: schema.trackResults.track,
        rawScore: schema.trackResults.rawScore,
        percentile: schema.trackResults.percentile,
        earnedAt: schema.trackResults.earnedAt,
      })
      .from(schema.trackResults)
      .innerJoin(schema.assessmentSessions, eq(schema.assessmentSessions.id, schema.trackResults.sessionId))
      .where(eq(schema.trackResults.userId, ctx.user.sub))
      .orderBy(desc(schema.trackResults.earnedAt));

    return Promise.all(
      rows.map(async (r): Promise<TrackResultHistoryItem> => {
        const [assessment] = await db
          .select({ title: schema.assessments.title })
          .from(schema.assessments)
          .where(eq(schema.assessments.id, r.assessmentId))
          .limit(1);
        return {
          sessionId: r.sessionId,
          assessmentId: r.assessmentId,
          assessmentTitle: assessment?.title ?? "",
          track: r.track as TrackResultHistoryItem["track"],
          rawScore: r.rawScore,
          percentile: r.percentile,
          earnedAt: r.earnedAt.toISOString(),
        };
      }),
    );
  }),
});
