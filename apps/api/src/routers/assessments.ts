import { TRPCError } from "@trpc/server";
import { z } from "zod";
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
  submitAppealInput,
  resolveFlagInput,
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

    if (assessment.inviteOnly) {
      if (!input.inviteToken) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This assessment requires an invite." });
      }
      const [invite] = await db
        .select()
        .from(schema.assessmentInvites)
        .where(
          and(
            eq(schema.assessmentInvites.token, input.inviteToken),
            eq(schema.assessmentInvites.assessmentId, assessment.id)
          )
        )
        .limit(1);
      if (!invite) throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found." });
      if (invite.expiresAt <= new Date()) throw new TRPCError({ code: "BAD_REQUEST", message: "Invite expired." });
      if (invite.status === "completed") throw new TRPCError({ code: "BAD_REQUEST", message: "Invite already used." });
      
      await db
        .update(schema.assessmentInvites)
        .set({ status: "accepted" })
        .where(eq(schema.assessmentInvites.id, invite.id));
    }

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
      .values({ 
        assessmentId: assessment.id, 
        userId: ctx.user.sub, 
        expiresAt: new Date(Date.now() + durationMs),
        webcamConsent: input.webcamConsent,
        webcamEnabled: input.webcamConsent,
      })
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
    
    if (input.event === "webcam_snapshot") {
      if (input.snapshotUrl && session.webcamEnabled) {
        await db.insert(schema.webcamSnapshots).values({
          sessionId: session.id,
          imageUrl: input.snapshotUrl,
        });
      }
      return { ok: true };
    }

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

      // Persist flag to database
      await db.insert(schema.integrityFlags).values({
        sessionId: session.id,
        userId: ctx.user.sub,
        kind: input.event === "blur" ? "tab_blur" : "paste",
        severity: "warning",
        detail: { count: telemetry[input.event]! },
        resolution: "pending",
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

    // Auto-post an achievement card when the candidate clears a layer (score >= 60%).
    // This is intentionally fire-and-forget — never block the response on it.
    if (!pending && rawScore >= 0.6) {
      const name = await authorName(ctx.user.sub);
      const percentileStr = Math.round(percentile);
      const scoreStr = Math.round(rawScore * 100);
      const body = `🏆 ${name} cleared the ${assessment.track} Layer ${assessment.layer} assessment — scored ${scoreStr}%, ${percentileStr}th percentile!`;
      db.insert(schema.posts)
        .values({
          authorId: ctx.user.sub,
          body,
          kind: "achievement",
        })
        .catch((err) => console.error("[achievement-post] Failed:", err));
    }

    const result: SubmitSessionResult = { rawScore, percentile, pending };
    
    // Background Integrity Checks
    if (session.webcamEnabled) {
      await tryEnqueue(
        getQueues().faceMatch.add("face-match", { sessionId: session.id }),
        `face-match (session ${session.id})`
      );
    }
    
    // Always run plagiarism check for submitted code answers
    await tryEnqueue(
      getQueues().plagiarismCheck.add("plagiarism-check", { sessionId: session.id }),
      `plagiarism-check (session ${session.id})`
    );

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

  myFlags: protectedProcedure.input(z.object({ sessionId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const session = await requireOwnActiveSession(input.sessionId, ctx.user.sub);
    return db
      .select()
      .from(schema.integrityFlags)
      .where(and(eq(schema.integrityFlags.sessionId, session.id), eq(schema.integrityFlags.visible, true)))
      .orderBy(desc(schema.integrityFlags.createdAt));
  }),

  submitAppeal: protectedProcedure.input(submitAppealInput).mutation(async ({ ctx, input }) => {
    const [flag] = await db
      .select()
      .from(schema.integrityFlags)
      .where(and(eq(schema.integrityFlags.id, input.flagId), eq(schema.integrityFlags.userId, ctx.user.sub)))
      .limit(1);
    if (!flag) throw new TRPCError({ code: "NOT_FOUND" });
    if (!flag.visible) throw new TRPCError({ code: "FORBIDDEN" });
    if (flag.resolution && flag.resolution !== "pending") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Flag already resolved" });
    }

    await db
      .update(schema.integrityFlags)
      .set({ appealText: input.text, appealedAt: new Date(), resolution: "pending" })
      .where(eq(schema.integrityFlags.id, input.flagId));
    return { ok: true };
  }),

  resolveFlag: protectedProcedure.input(resolveFlagInput).mutation(async ({ ctx, input }) => {
    // Only author of the assessment can resolve (simplified auth check for now)
    const [flag] = await db.select().from(schema.integrityFlags).where(eq(schema.integrityFlags.id, input.flagId)).limit(1);
    if (!flag) throw new TRPCError({ code: "NOT_FOUND" });
    
    const [session] = await db.select().from(schema.assessmentSessions).where(eq(schema.assessmentSessions.id, flag.sessionId)).limit(1);
    if (!session) throw new TRPCError({ code: "NOT_FOUND" });
    
    const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, session.assessmentId)).limit(1);
    if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });
    if (assessment.authorId !== ctx.user.sub) throw new TRPCError({ code: "FORBIDDEN" });

    await db
      .update(schema.integrityFlags)
      .set({ 
        resolution: input.resolution, 
        resolvedBy: ctx.user.sub, 
        resolvedAt: new Date(),
        resolverNotes: input.notes,
      })
      .where(eq(schema.integrityFlags.id, input.flagId));
    return { ok: true };
  }),

  listFlagsBySession: protectedProcedure.input(z.object({ sessionId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [session] = await db.select().from(schema.assessmentSessions).where(eq(schema.assessmentSessions.id, input.sessionId)).limit(1);
    if (!session) throw new TRPCError({ code: "NOT_FOUND" });
    
    const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, session.assessmentId)).limit(1);
    if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });
    if (assessment.authorId !== ctx.user.sub) throw new TRPCError({ code: "FORBIDDEN" });

    return db
      .select()
      .from(schema.integrityFlags)
      .where(eq(schema.integrityFlags.sessionId, input.sessionId))
      .orderBy(desc(schema.integrityFlags.createdAt));
  }),
});
