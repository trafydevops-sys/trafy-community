import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import {
  applyToJobInput,
  listApplicationsForJobInput,
  updateApplicationStatusInput,
  bulkUpdateStatusInput,
  exportPipelineInput,
  type Application,
} from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";
import { notify } from "../lib/notify.js";
import { emitPipelineUpdate } from "../lib/realtime.js";

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

    const now = new Date();
    const updatePayload: any = { status: input.status, updatedAt: now };

    if (input.status === "rejected") {
      updatePayload.rejectionReason = input.rejectionReason;
      updatePayload.rejectedAt = now;
    } else if (input.status === "screening") updatePayload.screenedAt = now;
    else if (input.status === "assessment") updatePayload.assessmentSentAt = now;
    else if (input.status === "interview") updatePayload.interviewedAt = now;
    else if (input.status === "offer") updatePayload.offeredAt = now;
    else if (input.status === "hired") updatePayload.hiredAt = now;

    const [row] = await db
      .update(schema.applications)
      .set(updatePayload)
      .where(eq(schema.applications.id, input.applicationId))
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    await db.insert(schema.applicationAuditLog).values({
      applicationId: input.applicationId,
      actorId: ctx.user.sub,
      action: "status_changed",
      fromValue: application.status,
      toValue: input.status,
      detail: input.rejectionReason || null,
    });

    // Auto-assessment logic
    if (input.status === "assessment") {
      const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.jobId, job.id)).limit(1);
      if (assessment) {
        await db.insert(schema.assessmentInvites).values({
          assessmentId: assessment.id,
          inviteeUserId: application.applicantId,
          token: crypto.randomUUID(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        });
        await db.insert(schema.applicationAuditLog).values({
          applicationId: input.applicationId,
          actorId: ctx.user.sub,
          action: "assessment_sent",
        });
      }
    }

    emitPipelineUpdate(job.id);
    await notify(application.applicantId, "application_status_changed", {
      actorId: ctx.user.sub,
      actorName: await profileName(ctx.user.sub),
      jobId: job.id,
      jobTitle: job.title,
      status: input.status,
    });

    return toApplication(row);
  }),

  bulkUpdateStatus: protectedProcedure.input(bulkUpdateStatusInput).mutation(async ({ ctx, input }) => {
    const applications = await db
      .select()
      .from(schema.applications)
      .innerJoin(schema.jobs, eq(schema.jobs.id, schema.applications.jobId))
      .where(inArray(schema.applications.id, input.applicationIds));

    let updatedCount = 0;
    const now = new Date();
    
    // Using a loop to handle each individually to properly generate audit logs and notifications
    for (const { applications: app, jobs: job } of applications) {
      if (job.posterId !== ctx.user.sub) continue;
      
      const updatePayload: any = { status: input.status, updatedAt: now };

      if (input.status === "rejected") {
        updatePayload.rejectionReason = input.rejectionReason;
        updatePayload.rejectedAt = now;
      } else if (input.status === "screening") updatePayload.screenedAt = now;
      else if (input.status === "assessment") updatePayload.assessmentSentAt = now;
      else if (input.status === "interview") updatePayload.interviewedAt = now;
      else if (input.status === "offer") updatePayload.offeredAt = now;
      else if (input.status === "hired") updatePayload.hiredAt = now;

      await db
        .update(schema.applications)
        .set(updatePayload)
        .where(eq(schema.applications.id, app.id));

      await db.insert(schema.applicationAuditLog).values({
        applicationId: app.id,
        actorId: ctx.user.sub,
        action: "status_changed",
        fromValue: app.status,
        toValue: input.status,
        detail: input.rejectionReason || null,
      });

      if (input.status === "assessment") {
        const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.jobId, job.id)).limit(1);
        if (assessment) {
          await db.insert(schema.assessmentInvites).values({
            assessmentId: assessment.id,
            inviteeUserId: app.applicantId,
            token: crypto.randomUUID(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          });
          await db.insert(schema.applicationAuditLog).values({
            applicationId: app.id,
            actorId: ctx.user.sub,
            action: "assessment_sent",
          });
        }
      }
      
      emitPipelineUpdate(job.id);
      await notify(app.applicantId, "application_status_changed", {
        actorId: ctx.user.sub,
        actorName: await profileName(ctx.user.sub),
        jobId: job.id,
        jobTitle: job.title,
        status: input.status,
      });

      updatedCount++;
    }
    
    return { updated: updatedCount };
  }),

  auditLog: protectedProcedure
    .input(z.object({ applicationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [application] = await db
        .select()
        .from(schema.applications)
        .where(eq(schema.applications.id, input.applicationId))
        .limit(1);
      if (!application) throw new TRPCError({ code: "NOT_FOUND" });

      const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, application.jobId)).limit(1);
      if (!job || job.posterId !== ctx.user.sub) throw new TRPCError({ code: "FORBIDDEN" });

      const logs = await db
        .select()
        .from(schema.applicationAuditLog)
        .where(eq(schema.applicationAuditLog.applicationId, input.applicationId))
        .orderBy(desc(schema.applicationAuditLog.createdAt));

      return Promise.all(
        logs.map(async (log) => ({
          ...log,
          action: log.action as any,
          actorName: await profileName(log.actorId),
          createdAt: log.createdAt.toISOString(),
        }))
      );
    }),

  exportPipeline: protectedProcedure
    .input(exportPipelineInput)
    .query(async ({ ctx, input }) => {
      const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, input.jobId)).limit(1);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      if (job.posterId !== ctx.user.sub) throw new TRPCError({ code: "FORBIDDEN" });

      const rows = await db
        .select()
        .from(schema.applications)
        .where(eq(schema.applications.jobId, input.jobId))
        .orderBy(desc(schema.applications.createdAt));

      const exports = [];
      const nowMs = Date.now();
      for (const row of rows) {
        const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, row.applicantId)).limit(1);
        const [user] = await db.select().from(schema.users).where(eq(schema.users.id, row.applicantId)).limit(1);
        
        exports.push({
          applicantName: profile?.fullName || "Unknown",
          applicantEmail: user?.email || "",
          status: row.status as any,
          rejectionReason: row.rejectionReason || undefined,
          coverNote: row.coverNote || undefined,
          appliedAt: row.createdAt.toISOString(),
          screenedAt: row.screenedAt?.toISOString(),
          assessmentSentAt: row.assessmentSentAt?.toISOString(),
          interviewedAt: row.interviewedAt?.toISOString(),
          offeredAt: row.offeredAt?.toISOString(),
          hiredAt: row.hiredAt?.toISOString(),
          rejectedAt: row.rejectedAt?.toISOString(),
          daysSinceApplied: Math.floor((nowMs - row.createdAt.getTime()) / 86400000),
        });
      }
      return exports;
    }),
});
