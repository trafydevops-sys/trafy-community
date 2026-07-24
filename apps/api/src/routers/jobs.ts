import { TRPCError } from "@trpc/server";
import { and, eq, ilike, or } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import {
  createJobInput,
  getJobInput,
  listJobsInput,
  setJobPublishedInput,
  updateJobInput,
  type JobDetail,
  type JobSummary,
} from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";

async function posterName(userId: string): Promise<string> {
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1);
  return profile?.fullName || "";
}

async function toSummary(row: typeof schema.jobs.$inferSelect): Promise<JobSummary> {
  const applicationRows = await db
    .select({ id: schema.applications.id })
    .from(schema.applications)
    .where(eq(schema.applications.jobId, row.id));

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
    return toSummary(row);
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
    return toSummary(row);
  }),

  setPublished: protectedProcedure.input(setJobPublishedInput).mutation(async ({ ctx, input }) => {
    await assertPoster(input.jobId, ctx.user.sub);
    const [row] = await db
      .update(schema.jobs)
      .set({ published: input.published, updatedAt: new Date() })
      .where(eq(schema.jobs.id, input.jobId))
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return toSummary(row);
  }),

  listMine: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select().from(schema.jobs).where(eq(schema.jobs.posterId, ctx.user.sub));
    return Promise.all(rows.map(toSummary));
  }),

  listPublished: protectedProcedure.input(listJobsInput).query(async ({ input }) => {
    const conditions = [eq(schema.jobs.published, true)];
    if (input.query) {
      conditions.push(
        or(ilike(schema.jobs.title, `%${input.query}%`), ilike(schema.jobs.description, `%${input.query}%`))!
      );
    }
    if (input.jobType) conditions.push(eq(schema.jobs.jobType, input.jobType));

    const rows = await db
      .select()
      .from(schema.jobs)
      .where(and(...conditions));
    return Promise.all(rows.map(toSummary));
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

    const summary = await toSummary(job);
    const detail: JobDetail = { ...summary, myApplicationStatus: myApplication?.status };
    return detail;
  }),
});
