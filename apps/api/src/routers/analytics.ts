import { z } from "zod";
import { sql, eq, and, desc, isNotNull, inArray, gte, lte } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import { protectedProcedure, router } from "../lib/trpc.js";
import { TRPCError } from "@trpc/server";
import { Redis } from "ioredis";
import { env } from "../lib/env.js";
import {
  funnelAnalyticsInput,
  timeToHireInput,
  assessmentDropoffInput,
  scoreOutcomeInput,
} from "@trafy-community/core";

// Reuse existing bullmq connection if possible or create a new one
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const CACHE_TTL = 300; // 5 minutes

async function getCached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const data = await fetcher();
  await redis.set(key, JSON.stringify(data), "EX", CACHE_TTL);
  return data;
}

// Helper to determine if user is admin
async function isAdmin(db: any, userId: string) {
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1);
  return profile?.userRole === "admin";
}

function pearson(xs: number[], ys: number[]): number {
  if (xs.length === 0 || ys.length === 0 || xs.length !== ys.length) return 0;
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i]!, 0);
  const sumX2 = xs.reduce((a, x) => a + x * x, 0);
  const sumY2 = ys.reduce((a, y) => a + y * y, 0);
  const denominator = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));
  return denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
}

const APPLICATION_PIPELINE_ORDER = ["applied", "reviewing", "interview", "offer", "hired"];

export const analyticsRouter = router({
  getFunnel: protectedProcedure
    .input(funnelAnalyticsInput)
    .query(async ({ ctx, input }) => {
      const admin = await isAdmin(ctx.db, ctx.user.sub);
      const cacheKey = `analytics:funnel:${ctx.user.sub}:${JSON.stringify(input)}`;

      return getCached(cacheKey, async () => {
        let conditions = [];
        if (!admin) conditions.push(eq(schema.jobs.posterId, ctx.user.sub));
        if (input.jobId) conditions.push(eq(schema.applications.jobId, input.jobId));
        if (input.dateFrom) conditions.push(gte(schema.applications.createdAt, new Date(input.dateFrom)));
        if (input.dateTo) conditions.push(lte(schema.applications.createdAt, new Date(input.dateTo)));

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const results = await ctx.db
          .select({
            status: schema.applications.status,
            count: sql<number>`cast(count(*) as integer)`,
          })
          .from(schema.applications)
          .innerJoin(schema.jobs, eq(schema.jobs.id, schema.applications.jobId))
          .where(whereClause)
          .groupBy(schema.applications.status);

        const countsByStatus = Object.fromEntries(results.map(r => [r.status, r.count]));
        
        const stages = APPLICATION_PIPELINE_ORDER.map((stage, i) => {
          const count = countsByStatus[stage] || 0;
          let conversionRate = 0;
          if (i > 0) {
            const prevCount = countsByStatus[APPLICATION_PIPELINE_ORDER[i - 1]!] || 0;
            if (prevCount > 0) {
              // Conversion is count / prevCount (simplified, assume pipeline drops off linearly)
              conversionRate = count / prevCount;
            }
          } else {
            conversionRate = 1; // 100% at the top of the funnel
          }
          
          return {
            stage: stage as any,
            count,
            conversionRate: Math.min(1, Math.max(0, conversionRate)),
          };
        });

        const totalApplications = stages[0]?.count || 0;
        const hiredCount = countsByStatus["hired"] || 0;
        const overallHireRate = totalApplications > 0 ? hiredCount / totalApplications : 0;

        return {
          stages,
          totalApplications,
          overallHireRate,
        };
      });
    }),

  getTimeToHire: protectedProcedure
    .input(timeToHireInput)
    .query(async ({ ctx, input }) => {
      const admin = await isAdmin(ctx.db, ctx.user.sub);
      const cacheKey = `analytics:timeToHire:${ctx.user.sub}:${JSON.stringify(input)}`;

      return getCached(cacheKey, async () => {
        let conditions = [];
        if (!admin) conditions.push(eq(schema.jobs.posterId, ctx.user.sub));
        if (input.jobId) conditions.push(eq(schema.applications.jobId, input.jobId));
        if (input.dateFrom) conditions.push(gte(schema.applications.createdAt, new Date(input.dateFrom)));
        if (input.dateTo) conditions.push(lte(schema.applications.createdAt, new Date(input.dateTo)));

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        // Fetch applications to compute rates
        const allRelevantApps = await ctx.db
          .select({ status: schema.applications.status })
          .from(schema.applications)
          .innerJoin(schema.jobs, eq(schema.jobs.id, schema.applications.jobId))
          .where(whereClause);

        const offeredCount = allRelevantApps.filter(a => ['offer', 'hired'].includes(a.status)).length;
        const hiredCount = allRelevantApps.filter(a => a.status === 'hired').length;
        const offerAcceptanceRate = offeredCount > 0 ? hiredCount / offeredCount : 0;

        // Fetch hired applications with timestamps
        const hiredApps = await ctx.db
          .select({
            createdAt: schema.applications.createdAt,
            screenedAt: schema.applications.screenedAt,
            assessmentSentAt: schema.applications.assessmentSentAt,
            interviewedAt: schema.applications.interviewedAt,
            offeredAt: schema.applications.offeredAt,
            hiredAt: schema.applications.hiredAt,
          })
          .from(schema.applications)
          .innerJoin(schema.jobs, eq(schema.jobs.id, schema.applications.jobId))
          .where(and(eq(schema.applications.status, "hired"), whereClause));

        // Compute durations
        const durations = {
          total: [] as number[],
          applied_to_screening: [] as number[],
          screening_to_assessment: [] as number[],
          assessment_to_interview: [] as number[],
          interview_to_offer: [] as number[],
          offer_to_hire: [] as number[],
        };

        const msToDays = (ms: number) => Math.max(0, ms / (1000 * 60 * 60 * 24));

        const trendMap = new Map<string, { days: number[]; hireCount: number }>();

        hiredApps.forEach(a => {
          if (a.hiredAt) {
            const totalDays = msToDays(a.hiredAt.getTime() - a.createdAt.getTime());
            durations.total.push(totalDays);

            const month = a.hiredAt.toISOString().slice(0, 7); // YYYY-MM
            if (!trendMap.has(month)) trendMap.set(month, { days: [], hireCount: 0 });
            trendMap.get(month)!.days.push(totalDays);
            trendMap.get(month)!.hireCount++;

            if (a.screenedAt) durations.applied_to_screening.push(msToDays(a.screenedAt.getTime() - a.createdAt.getTime()));
            if (a.assessmentSentAt && a.screenedAt) durations.screening_to_assessment.push(msToDays(a.assessmentSentAt.getTime() - a.screenedAt.getTime()));
            if (a.interviewedAt && a.assessmentSentAt) durations.assessment_to_interview.push(msToDays(a.interviewedAt.getTime() - a.assessmentSentAt.getTime()));
            if (a.offeredAt && a.interviewedAt) durations.interview_to_offer.push(msToDays(a.offeredAt.getTime() - a.interviewedAt.getTime()));
            if (a.hiredAt && a.offeredAt) durations.offer_to_hire.push(msToDays(a.hiredAt.getTime() - a.offeredAt.getTime()));
          }
        });

        const computeStats = (arr: number[]) => {
          if (arr.length === 0) return { medianDays: 0, avgDays: 0, p90Days: 0 };
          arr.sort((a, b) => a - b);
          const sum = arr.reduce((acc, val) => acc + val, 0);
          return {
            medianDays: arr[Math.floor(arr.length / 2)] || 0,
            avgDays: sum / arr.length,
            p90Days: arr[Math.floor(arr.length * 0.9)] || 0,
          };
        };

        const totalStats = computeStats(durations.total);

        const stageKeys = ["applied_to_screening", "screening_to_assessment", "assessment_to_interview", "interview_to_offer", "offer_to_hire"] as const;
        const stageDurations = stageKeys.map(key => ({
          stage: key,
          ...computeStats(durations[key]),
        }));

        const trend = Array.from(trendMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([month, data]) => {
            const stats = computeStats(data.days);
            return { month, medianDays: stats.medianDays, hireCount: data.hireCount };
          });

        return {
          medianDaysToHire: totalStats.medianDays,
          avgDaysToHire: totalStats.avgDays,
          offerAcceptanceRate,
          stageDurations,
          trend,
        };
      });
    }),

  getAssessmentDropoff: protectedProcedure
    .input(assessmentDropoffInput)
    .query(async ({ ctx, input }) => {
      // NOTE: Assessment dropoff is typically global or scoped by track, not necessarily recruiter jobs,
      // but if we need to scope by recruiter jobs, we'd have to link assessments to jobs.
      // Assessments have an authorId and jobId. We'll use authorId or jobId if not admin.
      const admin = await isAdmin(ctx.db, ctx.user.sub);
      const cacheKey = `analytics:assessmentDropoff:${ctx.user.sub}:${JSON.stringify(input)}`;

      return getCached(cacheKey, async () => {
        let conditions = [];
        if (!admin) {
          // If not admin, only show stats for assessments they authored
          conditions.push(eq(schema.assessments.authorId, ctx.user.sub));
        }
        if (input.track) conditions.push(eq(schema.assessments.track, input.track));
        if (input.layer) conditions.push(eq(schema.assessments.layer, input.layer));
        if (input.dateFrom) conditions.push(gte(schema.assessmentSessions.startedAt, new Date(input.dateFrom)));
        if (input.dateTo) conditions.push(lte(schema.assessmentSessions.startedAt, new Date(input.dateTo)));

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        // We do a raw query or manual grouping to count started/submitted/graded
        const rawResults = await ctx.db
          .select({
            track: schema.assessments.track,
            layer: schema.assessments.layer,
            status: schema.assessmentSessions.status,
            rawScore: schema.trackResults.rawScore,
          })
          .from(schema.assessments)
          .innerJoin(schema.assessmentSessions, eq(schema.assessmentSessions.assessmentId, schema.assessments.id))
          .leftJoin(schema.trackResults, eq(schema.trackResults.sessionId, schema.assessmentSessions.id))
          .where(whereClause);

        // Group by track + layer
        const bucketsMap = new Map<string, {
          track: string;
          layer: number;
          started: number;
          submitted: number;
          graded: number;
          scores: number[];
        }>();

        rawResults.forEach(r => {
          const key = `${r.track}-${r.layer}`;
          if (!bucketsMap.has(key)) {
            bucketsMap.set(key, { track: r.track, layer: r.layer, started: 0, submitted: 0, graded: 0, scores: [] });
          }
          const b = bucketsMap.get(key)!;
          
          b.started++;
          if (["submitted", "graded"].includes(r.status)) b.submitted++;
          if (r.status === "graded") b.graded++;
          if (r.rawScore !== null && r.rawScore !== undefined) b.scores.push(r.rawScore);
        });

        const buckets = Array.from(bucketsMap.values()).map(b => {
          return {
            track: b.track,
            layer: b.layer,
            started: b.started,
            submitted: b.submitted,
            graded: b.graded,
            dropoffRate: b.started > 0 ? 1 - (b.submitted / b.started) : 0,
            avgScore: b.scores.length > 0 ? b.scores.reduce((sum, s) => sum + s, 0) / b.scores.length : undefined,
          };
        });

        buckets.sort((a, b) => a.track.localeCompare(b.track) || a.layer - b.layer);

        const totalStarted = buckets.reduce((acc, b) => acc + b.started, 0);
        const totalSubmitted = buckets.reduce((acc, b) => acc + b.submitted, 0);
        const overallDropoffRate = totalStarted > 0 ? 1 - (totalSubmitted / totalStarted) : 0;

        return {
          buckets,
          overallDropoffRate,
        };
      });
    }),

  getScoreOutcome: protectedProcedure
    .input(scoreOutcomeInput)
    .query(async ({ ctx, input }) => {
      const admin = await isAdmin(ctx.db, ctx.user.sub);
      const cacheKey = `analytics:scoreOutcome:${ctx.user.sub}:${JSON.stringify(input)}`;

      return getCached(cacheKey, async () => {
        let jobCondition = undefined;
        if (!admin) {
           jobCondition = eq(schema.jobs.posterId, ctx.user.sub);
        }
        if (input.jobId) {
           jobCondition = jobCondition ? and(jobCondition, eq(schema.applications.jobId, input.jobId)) : eq(schema.applications.jobId, input.jobId);
        }

        const trackFilter = input.track ? eq(schema.trackResults.track, input.track) : undefined;

        // Fetch applicants and their outcome
        const rawPoints = await ctx.db
          .select({
            userId: schema.trackResults.userId,
            rawScore: schema.trackResults.rawScore,
            percentile: schema.trackResults.percentile,
            track: schema.trackResults.track,
            status: schema.applications.status,
          })
          .from(schema.trackResults)
          .innerJoin(schema.applications, eq(schema.applications.applicantId, schema.trackResults.userId))
          .innerJoin(schema.jobs, eq(schema.jobs.id, schema.applications.jobId))
          .where(and(jobCondition, trackFilter));

        // Deduplicate per user (if a user applied to multiple jobs we just take their best status for the plot)
        // A user's outcome across matching jobs
        const userOutcomes = new Map<string, { rawScore: number, percentile: number, track: string, status: string }>();

        rawPoints.forEach(p => {
          if (!userOutcomes.has(p.userId)) {
            userOutcomes.set(p.userId, { rawScore: p.rawScore || 0, percentile: p.percentile || 0, track: p.track, status: p.status });
          } else {
            // prioritize hired > rejected > open
            const current = userOutcomes.get(p.userId)!;
            if (p.status === "hired") current.status = "hired";
            else if (p.status === "rejected" && current.status !== "hired") current.status = "rejected";
          }
        });

        const points = Array.from(userOutcomes.entries()).map(([userId, p]) => {
          let outcome = "open" as "open" | "hired" | "rejected";
          if (p.status === "hired") outcome = "hired";
          else if (p.status === "rejected") outcome = "rejected";
          
          return {
            userId,
            rawScore: p.rawScore,
            percentile: p.percentile,
            track: p.track,
            outcome,
          };
        });

        // Compute Pearson correlation
        // Map outcome: hired=1, rejected=0, open=0.5
        const xs = points.map(p => p.rawScore);
        const ys = points.map(p => p.outcome === "hired" ? 1 : p.outcome === "rejected" ? 0 : 0.5);
        const correlation = pearson(xs, ys);

        const hiredScores = points.filter(p => p.outcome === "hired").map(p => p.rawScore);
        const rejectedScores = points.filter(p => p.outcome === "rejected").map(p => p.rawScore);

        const avgScoreHired = hiredScores.length > 0 ? hiredScores.reduce((a, b) => a + b, 0) / hiredScores.length : undefined;
        const avgScoreRejected = rejectedScores.length > 0 ? rejectedScores.reduce((a, b) => a + b, 0) / rejectedScores.length : undefined;

        return {
          points,
          correlation,
          avgScoreHired,
          avgScoreRejected,
        };
      });
    }),
});
