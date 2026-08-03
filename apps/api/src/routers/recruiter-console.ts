import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@trafy-community/db";
import {
  generateFromJdInput,
  jdSuggestionsSchema,
  createInviteInput,
  exportResultsInput,
  compareInput,
  layerConfigSchema,
  assessmentResultSchema,
} from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";
import { callGeminiJson } from "../lib/gemini-client.js";

// Utility to generate a random 16-char alphanumeric string for invite tokens
function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const recruiterConsoleRouter = router({
  generateFromJd: protectedProcedure.input(generateFromJdInput).mutation(async ({ input }) => {
    const prompt = `
      You are an expert technical recruiter. Analyze the following Job Description (JD):
      
      "${input.jdText}"
      
      Track selected: ${input.track}
      
      Extract the following:
      1. A short, professional title for the assessment (e.g. "Senior Python Backend Developer").
      2. A list of 5-10 key technical skills required, as short strings.
      3. A difficulty range for questions (min and max, between 1 and 5).
      
      Return as JSON matching this schema:
      {
        "suggestedTitle": "string",
        "skillsExtracted": ["string", "string"],
        "difficultyRange": { "min": number, "max": number }
      }
    `;

    const fallback = {
      suggestedTitle: `${input.track} Assessment`,
      skillsExtracted: [input.track],
      difficultyRange: { min: 2, max: 4 },
    };

    // The suggestedQuestionIds field will be populated via DB query, not LLM
    const partialResult = await callGeminiJson(prompt, z.object({
      suggestedTitle: z.string(),
      skillsExtracted: z.array(z.string()),
      difficultyRange: z.object({ min: z.number(), max: z.number() }),
    }), fallback);

    // Query questionBank for matching questions
    // This is a simplified matching logic. A robust version would use FTS or vector search.
    const questions = await db.select({ id: schema.questionBank.id, skillTags: schema.questionBank.skillTags })
      .from(schema.questionBank)
      .where(and(
        eq(schema.questionBank.track, input.track),
        eq(schema.questionBank.active, true)
      ));

    // Filter by difficulty in code to simplify DB query, or could do it in DB
    // Match skill tags
    const targetSkills = new Set(partialResult.skillsExtracted.map(s => s.toLowerCase()));
    
    // Sort questions by how many skill tags overlap
    const scoredQuestions = questions.map(q => {
      const qTags = (q.skillTags as string[] || []).map(t => t.toLowerCase());
      const overlap = qTags.filter(t => targetSkills.has(t)).length;
      return { id: q.id, overlap };
    });

    scoredQuestions.sort((a, b) => b.overlap - a.overlap);
    const suggestedQuestionIds = scoredQuestions.slice(0, 10).map(q => q.id);

    return {
      ...partialResult,
      suggestedQuestionIds,
    };
  }),

  updateLayerConfig: protectedProcedure
    .input(z.object({
      assessmentId: z.string().uuid(),
      layerConfig: layerConfigSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, input.assessmentId)).limit(1);
      if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });
      if (assessment.authorId !== ctx.user.sub) throw new TRPCError({ code: "FORBIDDEN" });

      await db
        .update(schema.assessments)
        .set({ layerConfig: input.layerConfig })
        .where(eq(schema.assessments.id, input.assessmentId));
      
      return { ok: true };
    }),

  createInvites: protectedProcedure.input(createInviteInput).mutation(async ({ ctx, input }) => {
    const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, input.assessmentId)).limit(1);
    if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });
    if (assessment.authorId !== ctx.user.sub) throw new TRPCError({ code: "FORBIDDEN" });

    const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
    const rowsToInsert: any[] = [];
    
    let inviteCount = 0;
    const linkToken = generateToken(); // Single reusable token for the "linkUrl" return

    if (input.emails && input.emails.length > 0) {
      for (const email of input.emails) {
        rowsToInsert.push({
          assessmentId: input.assessmentId,
          inviteeEmail: email,
          token: generateToken(),
          expiresAt,
        });
        inviteCount++;
      }
    }

    if (input.userIds && input.userIds.length > 0) {
      for (const userId of input.userIds) {
        rowsToInsert.push({
          assessmentId: input.assessmentId,
          inviteeUserId: userId,
          token: generateToken(),
          expiresAt,
        });
        inviteCount++;
      }
    }

    // Always create at least one generic link invite if no emails/users provided
    if (rowsToInsert.length === 0) {
      rowsToInsert.push({
        assessmentId: input.assessmentId,
        token: linkToken,
        expiresAt,
      });
      inviteCount++;
    }

    await db.insert(schema.assessmentInvites).values(rowsToInsert);

    // Emails and in-app notifications would be triggered here in a real implementation
    // using Resend or the notifications router logic.

    return { 
      inviteCount, 
      linkUrl: `/assess/${input.assessmentId}?token=${rowsToInsert[0].token}` 
    };
  }),

  listInvites: protectedProcedure
    .input(z.object({ assessmentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, input.assessmentId)).limit(1);
      if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });
      if (assessment.authorId !== ctx.user.sub) throw new TRPCError({ code: "FORBIDDEN" });

      return db
        .select()
        .from(schema.assessmentInvites)
        .where(eq(schema.assessmentInvites.assessmentId, input.assessmentId))
        .orderBy(desc(schema.assessmentInvites.createdAt));
    }),

  listResults: protectedProcedure
    .input(z.object({
      assessmentId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      // Basic implementation - would be expanded with filtering/sorting in production
      const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, input.assessmentId)).limit(1);
      if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });
      if (assessment.authorId !== ctx.user.sub) throw new TRPCError({ code: "FORBIDDEN" });

      const sessions = await db
        .select()
        .from(schema.assessmentSessions)
        .where(eq(schema.assessmentSessions.assessmentId, input.assessmentId));

      const results = await Promise.all(sessions.map(async (session) => {
        const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, session.userId)).limit(1);
        
        let rawScore = 0;
        let percentile = 0;
        if (session.status === "graded") {
           const [tr] = await db.select().from(schema.trackResults).where(eq(schema.trackResults.sessionId, session.id)).limit(1);
           if (tr) {
             rawScore = tr.rawScore;
             percentile = tr.percentile;
           }
        }

        const flags = await db.select().from(schema.integrityFlags).where(eq(schema.integrityFlags.sessionId, session.id));
        let highestSeverity = "none";
        if (flags.some(f => f.severity === "critical")) highestSeverity = "critical";
        else if (flags.some(f => f.severity === "warning")) highestSeverity = "warning";
        else if (flags.some(f => f.severity === "info")) highestSeverity = "info";

        const timeSpentMinutes = session.submittedAt 
          ? Math.round((session.submittedAt.getTime() - session.startedAt.getTime()) / 60000) 
          : 0;

        return {
          sessionId: session.id,
          candidateId: session.userId,
          candidateName: profile?.fullName || "Unknown",
          candidateEmail: "hidden@example.com", // In a real app, join with users table
          track: assessment.track as any,
          layer: assessment.layer,
          rawScore,
          percentile,
          status: session.status,
          flagCount: flags.length,
          flagSeverity: highestSeverity as any,
          startedAt: session.startedAt.toISOString(),
          submittedAt: session.submittedAt?.toISOString() || null,
          timeSpentMinutes,
        };
      }));

      return results;
    }),

  // Stubs for remaining procedures to satisfy type checker while providing structure
  getCandidateReport: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ input }) => {
      // Returns full report details for UI rendering
      return { sessionId: input.sessionId, report: "Full report object would go here" };
    }),

  compare: protectedProcedure.input(compareInput).query(async ({ input }) => {
    // Returns radar chart data comparing sessions
    return { sessionIds: input.sessionIds, data: "Comparison data" };
  }),

  exportResults: protectedProcedure.input(exportResultsInput).query(async ({ input }) => {
    // Return simple array that client will convert to CSV
    return [{ placeholder: true }];
  }),
});
