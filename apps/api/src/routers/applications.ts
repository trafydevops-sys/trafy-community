import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import {
  applyToJobInput,
  listApplicationsForJobInput,
  updateApplicationStatusInput,
  type Application,
} from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";
import { notify } from "../lib/notify.js";

async function profileName(userId: string): Promise<string> {
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1);
  return profile?.fullName || "";
}

async function toApplication(row: typeof schema.applications.$inferSelect): Promise<Application> {
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, row.jobId)).limit(1);
  const [contract] = await db
    .select()
    .from(schema.contracts)
    .where(eq(schema.contracts.applicationId, row.id))
    .limit(1);

  return {
    id: row.id,
    jobId: row.jobId,
    jobTitle: job?.title || "",
    applicantId: row.applicantId,
    applicantName: await profileName(row.applicantId),
    coverNote: row.coverNote ?? undefined,
    status: row.status as Application["status"],
    hasContract: Boolean(contract),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const applicationsRouter = router({
  apply: protectedProcedure.input(applyToJobInput).mutation(async ({ ctx, input }) => {
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, input.jobId)).limit(1);
    if (!job || !job.published) throw new TRPCError({ code: "NOT_FOUND" });
    if (job.posterId === ctx.user.sub) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "You can't apply to your own job posting." });
    }

    const [existing] = await db
      .select()
      .from(schema.applications)
      .where(and(eq(schema.applications.jobId, input.jobId), eq(schema.applications.applicantId, ctx.user.sub)))
      .limit(1);
    if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "You already applied to this job." });

    const [row] = await db
      .insert(schema.applications)
      .values({ jobId: input.jobId, applicantId: ctx.user.sub, coverNote: input.coverNote })
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    await notify(job.posterId, "job_application", {
      actorId: ctx.user.sub,
      actorName: await profileName(ctx.user.sub),
      jobId: job.id,
      jobTitle: job.title,
      applicationId: row.id,
    });

    return toApplication(row);
  }),

  myApplications: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(schema.applications)
      .where(eq(schema.applications.applicantId, ctx.user.sub))
      .orderBy(desc(schema.applications.createdAt));
    return Promise.all(rows.map(toApplication));
  }),

  listForJob: protectedProcedure.input(listApplicationsForJobInput).query(async ({ ctx, input }) => {
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, input.jobId)).limit(1);
    if (!job) throw new TRPCError({ code: "NOT_FOUND" });
    if (job.posterId !== ctx.user.sub) throw new TRPCError({ code: "FORBIDDEN" });

    const rows = await db
      .select()
      .from(schema.applications)
      .where(eq(schema.applications.jobId, input.jobId))
      .orderBy(desc(schema.applications.createdAt));
    return Promise.all(rows.map(toApplication));
  }),

  updateStatus: protectedProcedure.input(updateApplicationStatusInput).mutation(async ({ ctx, input }) => {
    const [application] = await db
      .select()
      .from(schema.applications)
      .where(eq(schema.applications.id, input.applicationId))
      .limit(1);
    if (!application) throw new TRPCError({ code: "NOT_FOUND" });

    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, application.jobId)).limit(1);
    if (!job || job.posterId !== ctx.user.sub) throw new TRPCError({ code: "FORBIDDEN" });

    const [row] = await db
      .update(schema.applications)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(schema.applications.id, input.applicationId))
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    await notify(application.applicantId, "application_status_changed", {
      actorId: ctx.user.sub,
      actorName: await profileName(ctx.user.sub),
      jobId: job.id,
      jobTitle: job.title,
      status: input.status,
    });

    return toApplication(row);
  }),
});
