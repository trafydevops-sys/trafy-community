import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@trafy-community/db";
import {
  reviewVivaInput,
  submitVivaAnswerInput,
  vivaQuestionSchema,
} from "@trafy-community/core";
import { protectedProcedure, router } from "../lib/trpc.js";
import { getQueues, tryEnqueue } from "../lib/queue.js";
import { TRPCError } from "@trpc/server";

export const vivaRouter = router({
  // ─── Auto-triggered internally, but exposed for testing/admin trigger
  initiate: protectedProcedure
    .input(z.object({ submissionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Find submission
      const [submission] = await ctx.db
        .select()
        .from(schema.buildSubmissions)
        .where(eq(schema.buildSubmissions.id, input.submissionId))
        .limit(1);

      if (!submission) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
      }

      // 48 hour window
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48);

      const [viva] = await ctx.db
        .insert(schema.vivaExams)
        .values({
          submissionId: submission.id,
          userId: submission.userId,
          track: "software-engineer", // Stub for now, should pull from submission context
          status: "generating_questions",
          expiresAt,
        })
        .returning();

      if (!viva) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create viva" });

      // Enqueue job
      const queues = getQueues();
      await tryEnqueue(
        queues.vivaQuestions.add("generate", { vivaId: viva.id, submissionId: submission.id }),
        "viva questions generation"
      );

      return viva;
    }),

  // ─── Candidate flow
  getMyViva: protectedProcedure
    .input(z.object({ submissionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [viva] = await ctx.db
        .select()
        .from(schema.vivaExams)
        .where(and(
          eq(schema.vivaExams.submissionId, input.submissionId),
          eq(schema.vivaExams.userId, ctx.user.sub)
        ))
        .limit(1);

      if (!viva) return null;

      const answers = await ctx.db
        .select({ id: schema.vivaAnswers.id })
        .from(schema.vivaAnswers)
        .where(eq(schema.vivaAnswers.vivaId, viva.id));

      const totalQuestions = (viva.questionsJson as any[] | null)?.length || 0;

      return {
        id: viva.id,
        submissionId: viva.submissionId,
        missionTitle: "Layer 3 Build Mission", // Stub
        track: viva.track,
        status: viva.status,
        questions: ['questions_ready', 'recording', 'transcribing', 'llm_grading', 'pending_review', 'approved', 'rejected'].includes(viva.status)
          ? viva.questionsJson
          : undefined,
        expiresAt: viva.expiresAt.toISOString(),
        startedAt: viva.startedAt?.toISOString(),
        answeredCount: answers.length,
        totalQuestions,
        rawScore: viva.rawScore,
      };
    }),

  startRecording: protectedProcedure
    .input(z.object({ vivaId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [viva] = await ctx.db
        .select()
        .from(schema.vivaExams)
        .where(and(eq(schema.vivaExams.id, input.vivaId), eq(schema.vivaExams.userId, ctx.user.sub)))
        .limit(1);

      if (!viva) throw new TRPCError({ code: "NOT_FOUND" });
      if (viva.status !== "questions_ready") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Viva not ready for recording or already started" });
      }

      await ctx.db
        .update(schema.vivaExams)
        .set({ status: "recording", startedAt: new Date() })
        .where(eq(schema.vivaExams.id, viva.id));

      return { success: true };
    }),

  submitAnswer: protectedProcedure
    .input(submitVivaAnswerInput)
    .mutation(async ({ ctx, input }) => {
      const [viva] = await ctx.db
        .select()
        .from(schema.vivaExams)
        .where(and(eq(schema.vivaExams.id, input.vivaId), eq(schema.vivaExams.userId, ctx.user.sub)))
        .limit(1);

      if (!viva) throw new TRPCError({ code: "NOT_FOUND" });
      if (viva.status !== "recording") throw new TRPCError({ code: "BAD_REQUEST", message: "Not in recording state" });
      if (new Date() > viva.expiresAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Viva expired" });

      // Upsert answer
      const existing = await ctx.db
        .select()
        .from(schema.vivaAnswers)
        .where(and(eq(schema.vivaAnswers.vivaId, viva.id), eq(schema.vivaAnswers.questionIndex, input.questionIndex)))
        .limit(1);

      if (existing.length > 0) {
        await ctx.db
          .update(schema.vivaAnswers)
          .set({ videoUrl: input.videoUrl, videoSeconds: input.videoSeconds })
          .where(eq(schema.vivaAnswers.id, existing[0]!.id));
      } else {
        await ctx.db
          .insert(schema.vivaAnswers)
          .values({
            vivaId: viva.id,
            questionIndex: input.questionIndex,
            videoUrl: input.videoUrl,
            videoSeconds: input.videoSeconds,
          });
      }

      return { success: true };
    }),

  completeViva: protectedProcedure
    .input(z.object({ vivaId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [viva] = await ctx.db
        .select()
        .from(schema.vivaExams)
        .where(and(eq(schema.vivaExams.id, input.vivaId), eq(schema.vivaExams.userId, ctx.user.sub)))
        .limit(1);

      if (!viva) throw new TRPCError({ code: "NOT_FOUND" });

      const answers = await ctx.db.select().from(schema.vivaAnswers).where(eq(schema.vivaAnswers.vivaId, viva.id));
      const totalQuestions = (viva.questionsJson as any[] | null)?.length || 0;

      if (answers.length < totalQuestions) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not all questions answered" });
      }

      await ctx.db
        .update(schema.vivaExams)
        .set({ status: "transcribing", completedAt: new Date() })
        .where(eq(schema.vivaExams.id, viva.id));

      const queues = getQueues();
      await tryEnqueue(
        queues.vivaGrading.add("grade", { vivaId: viva.id }),
        "viva grading"
      );

      return { success: true };
    }),

  // ─── Reviewer flow
  listPendingReview: protectedProcedure
    .query(async ({ ctx }) => {
      // Stub authorization: typically check if ctx.user is a recruiter or admin
      const vivas = await ctx.db
        .select({
          vivaId: schema.vivaExams.id,
          candidateName: schema.users.email, // Stub for full name
          track: schema.vivaExams.track,
          status: schema.vivaExams.status,
          llmRawScore: schema.vivaExams.llmRawScore,
          llmConfidence: schema.vivaExams.llmConfidence,
          submittedAt: schema.vivaExams.completedAt,
        })
        .from(schema.vivaExams)
        .innerJoin(schema.users, eq(schema.users.id, schema.vivaExams.userId))
        .where(eq(schema.vivaExams.status, "pending_review"))
        .orderBy(desc(schema.vivaExams.completedAt));

      return Promise.all(
        vivas.map(async (v) => {
          const rows = await ctx.db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(schema.vivaAnswers)
            .where(and(eq(schema.vivaAnswers.vivaId, v.vivaId), eq(schema.vivaAnswers.confidence, "low")));
          const count = rows[0]?.count ?? 0;
          return {
            ...v,
            missionTitle: "Layer 3 Build Mission",
            flaggedAnswers: count,
            submittedAt: v.submittedAt?.toISOString() || null,
          };
        })
      );
    }),

  getVivaForReview: protectedProcedure
    .input(z.object({ vivaId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [viva] = await ctx.db
        .select()
        .from(schema.vivaExams)
        .where(eq(schema.vivaExams.id, input.vivaId))
        .limit(1);

      if (!viva) throw new TRPCError({ code: "NOT_FOUND" });

      const [submission] = await ctx.db
        .select()
        .from(schema.buildSubmissions)
        .where(eq(schema.buildSubmissions.id, viva.submissionId))
        .limit(1);

      const answers = await ctx.db
        .select()
        .from(schema.vivaAnswers)
        .where(eq(schema.vivaAnswers.vivaId, viva.id))
        .orderBy(schema.vivaAnswers.questionIndex);

      return {
        viva,
        submission,
        answers,
      };
    }),

  editQuestions: protectedProcedure
    .input(z.object({ vivaId: z.string().uuid(), questions: z.array(vivaQuestionSchema) }))
    .mutation(async ({ ctx, input }) => {
      const [viva] = await ctx.db
        .select()
        .from(schema.vivaExams)
        .where(eq(schema.vivaExams.id, input.vivaId))
        .limit(1);

      if (!viva) throw new TRPCError({ code: "NOT_FOUND" });
      if (viva.status !== "questions_ready") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Can only edit questions before recording starts" });
      }

      await ctx.db
        .update(schema.vivaExams)
        .set({ questionsJson: input.questions, questionsEditedBy: ctx.user.sub })
        .where(eq(schema.vivaExams.id, viva.id));

      return { success: true };
    }),

  review: protectedProcedure
    .input(reviewVivaInput)
    .mutation(async ({ ctx, input }) => {
      const [viva] = await ctx.db
        .select()
        .from(schema.vivaExams)
        .where(eq(schema.vivaExams.id, input.vivaId))
        .limit(1);

      if (!viva) throw new TRPCError({ code: "NOT_FOUND" });
      if (viva.status !== "pending_review") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not pending review" });
      }

      let finalScore = null;
      let status = "rejected";

      if (input.action === "approve") {
        finalScore = viva.llmRawScore;
        status = "approved";
      } else if (input.action === "override") {
        finalScore = input.overrideScore;
        status = "approved";
      }

      await ctx.db
        .update(schema.vivaExams)
        .set({
          reviewerId: ctx.user.sub,
          reviewerScore: input.overrideScore ?? null,
          reviewNotes: input.notes ?? null,
          reviewedAt: new Date(),
          status,
          rawScore: finalScore,
        })
        .where(eq(schema.vivaExams.id, viva.id));

      if (input.answerOverrides && input.answerOverrides.length > 0) {
        for (const over of input.answerOverrides) {
          await ctx.db
            .update(schema.vivaAnswers)
            .set({ overrideScore: over.overrideScore })
            .where(and(eq(schema.vivaAnswers.vivaId, viva.id), eq(schema.vivaAnswers.questionIndex, over.questionIndex)));
        }
      }

      // If approved, push to track results
      if (status === "approved" && finalScore !== null) {
        // Stub: In real system, we'd also link to a session or define how L4 scores merge with L3.
        console.log("Viva approved. Final score:", finalScore);
      }

      return { success: true };
    }),
});
