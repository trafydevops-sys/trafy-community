import { TRPCError } from "@trpc/server";
import { eq, and, desc, inArray } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import { 
  createMissionInput, 
  startMissionInput, 
  submitMissionInput, 
  gradeMissionInput,
} from "@trafy-community/core";
import { router, protectedProcedure, publicProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";
import { getQueues, tryEnqueue } from "../lib/queue.js";

export const buildMissionsRouter = router({
  // ─── Author CRUD ────────────────────────────────────────────────────
  create: protectedProcedure.input(createMissionInput).mutation(async ({ ctx, input }) => {
    const authorId = ctx.user.sub;
    
    const [inserted] = await db
      .insert(schema.buildMissions)
      .values({
        ...input,
        authorId,
        rubricWeights: input.rubricWeights || {
          correctness: 0.3,
          structure: 0.25,
          tests: 0.25,
          documentation: 0.2,
        },
      })
      .returning();
      
    return inserted;
  }),

  publish: protectedProcedure.input(startMissionInput).mutation(async ({ ctx, input }) => {
    const [mission] = await db
      .select()
      .from(schema.buildMissions)
      .where(and(eq(schema.buildMissions.id, input.missionId), eq(schema.buildMissions.authorId, ctx.user.sub)))
      .limit(1);

    if (!mission) throw new TRPCError({ code: "NOT_FOUND" });

    await db
      .update(schema.buildMissions)
      .set({ published: true })
      .where(eq(schema.buildMissions.id, mission.id));
      
    return { success: true };
  }),

  listPublished: protectedProcedure.query(async () => {
    return await db.select().from(schema.buildMissions).where(eq(schema.buildMissions.published, true));
  }),

  // ─── Candidate flow ─────────────────────────────────────────────────
  start: protectedProcedure.input(startMissionInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.sub;
    const [mission] = await db
      .select()
      .from(schema.buildMissions)
      .where(and(eq(schema.buildMissions.id, input.missionId), eq(schema.buildMissions.published, true)))
      .limit(1);

    if (!mission) throw new TRPCError({ code: "NOT_FOUND", message: "Mission not found or not published" });

    const [existing] = await db
      .select()
      .from(schema.buildSubmissions)
      .where(and(eq(schema.buildSubmissions.missionId, mission.id), eq(schema.buildSubmissions.userId, userId)))
      .limit(1);

    if (existing) {
      if (existing.status !== 'expired') {
        throw new TRPCError({ code: "CONFLICT", message: "Submission already exists" });
      } else {
        throw new TRPCError({ code: "FORBIDDEN", message: "Mission expired" });
      }
    }

    const expiresAt = new Date(Date.now() + mission.timeLimitHours * 60 * 60 * 1000);

    const [submission] = await db
      .insert(schema.buildSubmissions)
      .values({
        missionId: mission.id,
        userId,
        status: "active",
        expiresAt,
      })
      .returning();

    return submission;
  }),

  getMySubmission: protectedProcedure.input(startMissionInput).query(async ({ ctx, input }) => {
    const [submission] = await db
      .select()
      .from(schema.buildSubmissions)
      .where(and(eq(schema.buildSubmissions.missionId, input.missionId), eq(schema.buildSubmissions.userId, ctx.user.sub)))
      .limit(1);

    return submission || null;
  }),

  submit: protectedProcedure.input(submitMissionInput).mutation(async ({ ctx, input }) => {
    const [submission] = await db
      .select()
      .from(schema.buildSubmissions)
      .where(and(eq(schema.buildSubmissions.id, input.submissionId), eq(schema.buildSubmissions.userId, ctx.user.sub)))
      .limit(1);

    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
    if (submission.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Submission is not active" });

    if (new Date() > new Date(submission.expiresAt)) {
      await db.update(schema.buildSubmissions).set({ status: "expired" }).where(eq(schema.buildSubmissions.id, submission.id));
      throw new TRPCError({ code: "BAD_REQUEST", message: "Mission deadline has passed" });
    }

    // Verify it is a public GitHub repo
    try {
      const match = input.repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match || !match[1] || !match[2]) throw new Error("Invalid GitHub URL");
      
      let repoName = match[2];
      if (repoName.endsWith(".git")) repoName = repoName.slice(0, -4);
      
      const res = await fetch(`https://api.github.com/repos/${match[1]}/${repoName}`);
      if (!res.ok) {
        throw new Error("Repository is not public or does not exist");
      }
    } catch (e: any) {
      throw new TRPCError({ code: "BAD_REQUEST", message: e.message || "Invalid repository" });
    }

    const [updated] = await db
      .update(schema.buildSubmissions)
      .set({
        status: "submitted",
        submittedAt: new Date(),
        repoUrl: input.repoUrl,
        writeup: input.writeup,
      })
      .where(eq(schema.buildSubmissions.id, submission.id))
      .returning();

    await tryEnqueue(getQueues().buildHarness.add("harness", { submissionId: submission.id }), "buildHarness");

    return updated;
  }),

  // ─── Reviewer flow ──────────────────────────────────────────────────
  listPendingReview: protectedProcedure.query(async ({ ctx }) => {
    const myMissions = await db
      .select({ id: schema.buildMissions.id })
      .from(schema.buildMissions)
      .where(eq(schema.buildMissions.authorId, ctx.user.sub));

    if (myMissions.length === 0) return [];

    return await db
      .select()
      .from(schema.buildSubmissions)
      .where(
        and(
          inArray(schema.buildSubmissions.missionId, myMissions.map(m => m.id)),
          inArray(schema.buildSubmissions.status, ["submitted", "harness_running", "harness_done"])
        )
      )
      .orderBy(desc(schema.buildSubmissions.submittedAt));
  }),

  grade: protectedProcedure.input(gradeMissionInput).mutation(async ({ ctx, input }) => {
    const [submission] = await db
      .select()
      .from(schema.buildSubmissions)
      .where(eq(schema.buildSubmissions.id, input.submissionId))
      .limit(1);

    if (!submission) throw new TRPCError({ code: "NOT_FOUND" });
    if (!["submitted", "harness_done"].includes(submission.status)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot grade unsubmitted or already graded mission" });
    }

    const [mission] = await db
      .select()
      .from(schema.buildMissions)
      .where(eq(schema.buildMissions.id, submission.missionId))
      .limit(1);

    if (!mission) throw new TRPCError({ code: "NOT_FOUND" });
    if (mission.authorId !== ctx.user.sub) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only the author can review" });
    }

    const weights = mission.rubricWeights as { correctness: number, structure: number, tests: number, documentation: number };
    const rubricAvg = 
      (input.correctnessScore * weights.correctness + 
       input.structureScore * weights.structure + 
       input.testsScore * weights.tests + 
       input.documentationScore * weights.documentation) / 5;

    const machineScore = submission.machineScore || 0;
    const rawScore = (machineScore * 0.4) + (rubricAvg * 0.6);

    const [updated] = await db
      .update(schema.buildSubmissions)
      .set({
        ...input,
        rubricAvg,
        rawScore,
        status: "graded",
        reviewerId: ctx.user.sub,
        reviewedAt: new Date(),
      })
      .where(eq(schema.buildSubmissions.id, submission.id))
      .returning();

    return updated;
  }),
});
