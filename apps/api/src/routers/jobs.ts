import { TRPCError } from "@trpc/server";
import { and, eq, ilike, or } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import {
  createJobInput,
  getJobInput,
  listJobsInput,
  setJobPublishedInput,
  updateJobInput,
  jobAlertInput,
  type JobDetail,
  type JobSummary,
} from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";
import { sql, desc, gte, lte } from "drizzle-orm";
import { z } from "zod";

async function posterName(userId: string): Promise<string> {
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1);
  return profile?.fullName || "";
}

async function toSummary(row: typeof schema.jobs.$inferSelect, userId: string): Promise<JobSummary> {
  const applicationRows = await db
    .select({ id: schema.applications.id })
    .from(schema.applications)
    .where(eq(schema.applications.jobId, row.id));

  let savedByMe = false;
  const [savedRow] = await db
    .select()
    .from(schema.savedJobs)
    .where(and(eq(schema.savedJobs.jobId, row.id), eq(schema.savedJobs.userId, userId)))
    .limit(1);
  if (savedRow) savedByMe = true;

  let meetsScoreGate = true;
  if (row.requiredTrack && row.minVerifiedScore != null) {
    meetsScoreGate = false;
    const [bestScore] = await db
      .select({ rawScore: schema.trackResults.rawScore })
      .from(schema.trackResults)
      .where(and(eq(schema.trackResults.userId, userId), eq(schema.trackResults.track, row.requiredTrack)))
      .orderBy(desc(schema.trackResults.rawScore))
      .limit(1);
    if (bestScore && bestScore.rawScore >= row.minVerifiedScore) {
      meetsScoreGate = true;
    }
  }

  let organizationName = undefined;
  if (row.organizationId) {
    const [org] = await db.select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, row.organizationId)).limit(1);
    if (org) organizationName = org.name;
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    jobType: row.jobType as JobSummary["jobType"],
    compensationType: row.compensationType as JobSummary["compensationType"],
    compensationMinCents: row.compensationMinCents,
    compensationMaxCents: row.compensationMaxCents ?? undefined,
    currency: row.currency,
    location: row.location ?? undefined,
    remote: row.remote,
    experienceLevel: row.experienceLevel ?? undefined,
    industry: row.industry ?? undefined,
    organizationId: row.organizationId ?? undefined,
    organizationName,
    requiredTrack: row.requiredTrack ?? undefined,
    minVerifiedScore: row.minVerifiedScore ?? undefined,
    tags: row.tags ? (row.tags as string[]) : undefined,
    savedByMe,
    meetsScoreGate,
    published: row.published,
    posterId: row.posterId,
    posterName: await posterName(row.posterId),
    applicationCount: applicationRows.length,
    createdAt: row.createdAt.toISOString(),
  };
}

async function assertPoster(jobId: string, userId: string) {
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId)).limit(1);
  if (!job) throw new TRPCError({ code: "NOT_FOUND" });
  if (job.posterId !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "Not your job posting." });
  return job;
}

export const jobsRouter = router({
  create: protectedProcedure.input(createJobInput).mutation(async ({ ctx, input }) => {
    const [row] = await db
      .insert(schema.jobs)
      .values({ posterId: ctx.user.sub, ...input })
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return toSummary(row, ctx.user.sub);
  }),

  update: protectedProcedure.input(updateJobInput).mutation(async ({ ctx, input }) => {
    const { jobId, ...rest } = input;
    await assertPoster(jobId, ctx.user.sub);
    const [row] = await db
      .update(schema.jobs)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(schema.jobs.id, jobId))
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return toSummary(row, ctx.user.sub);
  }),

  setPublished: protectedProcedure.input(setJobPublishedInput).mutation(async ({ ctx, input }) => {
    await assertPoster(input.jobId, ctx.user.sub);
    const [row] = await db
      .update(schema.jobs)
      .set({ published: input.published, updatedAt: new Date() })
      .where(eq(schema.jobs.id, input.jobId))
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return toSummary(row, ctx.user.sub);
  }),

  listMine: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select().from(schema.jobs).where(eq(schema.jobs.posterId, ctx.user.sub));
    return Promise.all(rows.map(r => toSummary(r, ctx.user.sub)));
  }),

  listPublished: protectedProcedure.input(listJobsInput).query(async ({ ctx, input }) => {
    const conditions = [eq(schema.jobs.published, true)];
    
    // Using simple FTS with websearch_to_tsquery for natural language search on title and description
    if (input.query) {
      conditions.push(
        sql`to_tsvector('english', ${schema.jobs.title} || ' ' || coalesce(${schema.jobs.description}, '')) @@ websearch_to_tsquery('english', ${input.query})`
      );
    }
    
    if (input.jobType) conditions.push(eq(schema.jobs.jobType, input.jobType));
    if (input.remote !== undefined) conditions.push(eq(schema.jobs.remote, input.remote));
    if (input.location) conditions.push(ilike(schema.jobs.location, `%${input.location}%`));
    if (input.experienceLevel) conditions.push(eq(schema.jobs.experienceLevel, input.experienceLevel));
    if (input.industry) conditions.push(eq(schema.jobs.industry, input.industry));
    if (input.organizationId) conditions.push(eq(schema.jobs.organizationId, input.organizationId));
    if (input.requiredTrack) conditions.push(eq(schema.jobs.requiredTrack, input.requiredTrack));
    if (input.minSalaryCents !== undefined) conditions.push(gte(schema.jobs.compensationMinCents, input.minSalaryCents));
    if (input.maxSalaryCents !== undefined) conditions.push(lte(schema.jobs.compensationMaxCents, input.maxSalaryCents));
    
    if (input.tags && input.tags.length > 0) {
      conditions.push(sql`${schema.jobs.tags} && ARRAY[${sql.join(input.tags, sql`, `)}]::text[]`);
    }

    if (input.cursor) {
      // Fetch the cursor job to get its createdAt
      const [cursorJob] = await db.select({ createdAt: schema.jobs.createdAt }).from(schema.jobs).where(eq(schema.jobs.id, input.cursor)).limit(1);
      if (cursorJob) {
        const condition = or(
          sql`${schema.jobs.createdAt} < ${cursorJob.createdAt}`,
          and(
            eq(schema.jobs.createdAt, cursorJob.createdAt),
            sql`${schema.jobs.id} < ${input.cursor}`
          )
        );
        if (condition) conditions.push(condition);
      }
    }

    const rows = await db
      .select()
      .from(schema.jobs)
      .where(and(...conditions))
      .orderBy(desc(schema.jobs.createdAt), desc(schema.jobs.id))
      .limit(input.limit);
      
    return Promise.all(rows.map(r => toSummary(r, ctx.user.sub)));
  }),

  getById: protectedProcedure.input(getJobInput).query(async ({ ctx, input }) => {
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, input.jobId)).limit(1);
    if (!job) throw new TRPCError({ code: "NOT_FOUND" });
    if (!job.published && job.posterId !== ctx.user.sub) throw new TRPCError({ code: "NOT_FOUND" });

    const [myApplication] = await db
      .select()
      .from(schema.applications)
      .where(and(eq(schema.applications.jobId, job.id), eq(schema.applications.applicantId, ctx.user.sub)))
      .limit(1);

    const summary = await toSummary(job, ctx.user.sub);
    const detail: JobDetail = { ...summary, myApplicationStatus: myApplication?.status };
    return detail;
  }),

  // Feature: Saved Jobs
  saveJob: protectedProcedure.input(getJobInput).mutation(async ({ ctx, input }) => {
    const { jobId } = input;
    const userId = ctx.user.sub;
    const [existing] = await db
      .select()
      .from(schema.savedJobs)
      .where(and(eq(schema.savedJobs.jobId, jobId), eq(schema.savedJobs.userId, userId)))
      .limit(1);

    if (existing) {
      await db
        .delete(schema.savedJobs)
        .where(and(eq(schema.savedJobs.jobId, jobId), eq(schema.savedJobs.userId, userId)));
      return { saved: false };
    } else {
      await db.insert(schema.savedJobs).values({ jobId, userId });
      return { saved: true };
    }
  }),

  listSaved: protectedProcedure.query(async ({ ctx }) => {
    const savedIds = await db
      .select({ jobId: schema.savedJobs.jobId })
      .from(schema.savedJobs)
      .where(eq(schema.savedJobs.userId, ctx.user.sub))
      .orderBy(desc(schema.savedJobs.savedAt));
      
    const jobsList = [];
    for (const { jobId } of savedIds) {
      const [jobRow] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId)).limit(1);
      if (jobRow) {
        jobsList.push(await toSummary(jobRow, ctx.user.sub));
      }
    }
    return jobsList;
  }),

  // Feature: Job Alerts
  createAlert: protectedProcedure
    .input(jobAlertInput)
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(schema.jobAlerts)
        .values({ userId: ctx.user.sub, ...input })
        .returning();
      return row;
    }),

  listAlerts: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(schema.jobAlerts)
      .where(eq(schema.jobAlerts.userId, ctx.user.sub))
      .orderBy(desc(schema.jobAlerts.createdAt));
  }),

  deleteAlert: protectedProcedure
    .input(z.object({ alertId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { alertId } = input;
      const [alert] = await db.select().from(schema.jobAlerts).where(eq(schema.jobAlerts.id, alertId)).limit(1);
      if (!alert) throw new TRPCError({ code: "NOT_FOUND" });
      if (alert.userId !== ctx.user.sub) throw new TRPCError({ code: "FORBIDDEN" });
      
      await db.delete(schema.jobAlerts).where(eq(schema.jobAlerts.id, alertId));
      return { ok: true };
    }),

  // Feature: Recommendations
  recommended: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.sub;
    
    // 1. Get user's track results
    const tracks = await db
      .select({ track: schema.trackResults.track, rawScore: schema.trackResults.rawScore })
      .from(schema.trackResults)
      .where(eq(schema.trackResults.userId, userId));
      
    const trackNames = tracks.map(t => t.track);
    const scoreMap = new Map(tracks.map(t => [t.track, t.rawScore]));

    // 2. We don't have location or remote preference in profile currently, so we'll skip them
    // or we can add them later. For now, we'll only score on tracks and recency.

    // 3. Fetch all active jobs, filtering out ones they already applied for or saved
    const appliedSubquery = db.select({ jobId: schema.applications.jobId }).from(schema.applications).where(eq(schema.applications.applicantId, userId));
    const savedSubquery = db.select({ jobId: schema.savedJobs.jobId }).from(schema.savedJobs).where(eq(schema.savedJobs.userId, userId));
    
    const conditions = [
      eq(schema.jobs.published, true),
      sql`${schema.jobs.id} NOT IN (${appliedSubquery})`,
      sql`${schema.jobs.id} NOT IN (${savedSubquery})`
    ];
    
    if (trackNames.length > 0) {
      const condition = or(
        sql`${schema.jobs.requiredTrack} IS NULL`,
        sql`${schema.jobs.requiredTrack} = ANY(ARRAY[${sql.join(trackNames, sql`, `)}]::text[])`
      );
      if (condition) conditions.push(condition);
    } else {
      conditions.push(sql`${schema.jobs.requiredTrack} IS NULL`);
    }

    const availableJobs = await db
      .select()
      .from(schema.jobs)
      .where(and(...conditions))
      .limit(200);

    // 4. Score jobs
    type ScoredJob = { job: typeof schema.jobs.$inferSelect; score: number };
    const scoredJobs: ScoredJob[] = availableJobs.map(job => {
      let score = 0;
      // Track match
      if (job.requiredTrack && scoreMap.has(job.requiredTrack)) {
        if (scoreMap.get(job.requiredTrack)! >= (job.minVerifiedScore ?? 0)) {
          score += 3;
        }
      }
      // Location match (skipped as it's not in profile schema yet)
      // Remote match (skipped as it's not in profile schema yet)
      // Recency: +1 per week (max 4 weeks)
      const weeksOld = Math.floor((Date.now() - job.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 7));
      if (weeksOld < 4) {
        score += (4 - weeksOld);
      }
      return { job, score };
    });

    // 5. Sort and take top 20
    scoredJobs.sort((a, b) => b.score - a.score);
    const top20 = scoredJobs.slice(0, 20).map(sj => sj.job);
    
    return Promise.all(top20.map(r => toSummary(r, userId)));
  }),
});
