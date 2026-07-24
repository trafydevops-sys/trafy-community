import { TRPCError } from "@trpc/server";
import { asc, eq, or } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import {
  contractIdInput,
  createContractInput,
  milestoneIdInput,
  type Contract,
  type Milestone,
} from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";
import { notify } from "../lib/notify.js";

async function profileName(userId: string): Promise<string> {
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1);
  return profile?.fullName || "";
}

async function toContract(row: typeof schema.contracts.$inferSelect): Promise<Contract> {
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, row.jobId)).limit(1);
  const milestoneRows = await db
    .select()
    .from(schema.contractMilestones)
    .where(eq(schema.contractMilestones.contractId, row.id))
    .orderBy(asc(schema.contractMilestones.order));

  const milestones: Milestone[] = milestoneRows.map((m) => ({
    id: m.id,
    title: m.title,
    amountCents: m.amountCents,
    status: m.status as Milestone["status"],
    order: m.order,
    fundedAt: m.fundedAt?.toISOString(),
    releasedAt: m.releasedAt?.toISOString(),
  }));

  const totalCents = milestoneRows.reduce((sum, m) => sum + m.amountCents, 0);
  const fundedCents = milestoneRows.filter((m) => m.status === "funded" || m.status === "released").reduce((sum, m) => sum + m.amountCents, 0);
  const releasedCents = milestoneRows.filter((m) => m.status === "released").reduce((sum, m) => sum + m.amountCents, 0);

  return {
    id: row.id,
    jobId: row.jobId,
    jobTitle: job?.title || "",
    employerId: row.employerId,
    employerName: await profileName(row.employerId),
    talentId: row.talentId,
    talentName: await profileName(row.talentId),
    title: row.title,
    currency: row.currency,
    status: row.status as Contract["status"],
    totalCents,
    fundedCents,
    releasedCents,
    milestones,
    createdAt: row.createdAt.toISOString(),
  };
}

export const contractsRouter = router({
  create: protectedProcedure.input(createContractInput).mutation(async ({ ctx, input }) => {
    const [application] = await db
      .select()
      .from(schema.applications)
      .where(eq(schema.applications.id, input.applicationId))
      .limit(1);
    if (!application) throw new TRPCError({ code: "NOT_FOUND" });

    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, application.jobId)).limit(1);
    if (!job || job.posterId !== ctx.user.sub) throw new TRPCError({ code: "FORBIDDEN" });

    const [existing] = await db
      .select()
      .from(schema.contracts)
      .where(eq(schema.contracts.applicationId, input.applicationId))
      .limit(1);
    if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "A contract already exists for this application." });

    const [contractRow] = await db
      .insert(schema.contracts)
      .values({
        jobId: job.id,
        applicationId: application.id,
        employerId: ctx.user.sub,
        talentId: application.applicantId,
        title: input.title,
        currency: input.currency,
      })
      .returning();
    if (!contractRow) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    await db.insert(schema.contractMilestones).values(
      input.milestones.map((m, i) => ({
        contractId: contractRow.id,
        title: m.title,
        amountCents: m.amountCents,
        order: i,
      }))
    );

    await db
      .update(schema.applications)
      .set({ status: "hired", updatedAt: new Date() })
      .where(eq(schema.applications.id, application.id));

    await notify(application.applicantId, "contract_created", {
      actorId: ctx.user.sub,
      actorName: await profileName(ctx.user.sub),
      jobId: job.id,
      jobTitle: job.title,
      contractId: contractRow.id,
    });

    return toContract(contractRow);
  }),

  listMine: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(schema.contracts)
      .where(or(eq(schema.contracts.employerId, ctx.user.sub), eq(schema.contracts.talentId, ctx.user.sub)));
    return Promise.all(rows.map(toContract));
  }),

  getById: protectedProcedure.input(contractIdInput).query(async ({ ctx, input }) => {
    const [row] = await db.select().from(schema.contracts).where(eq(schema.contracts.id, input.contractId)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    if (row.employerId !== ctx.user.sub && row.talentId !== ctx.user.sub) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return toContract(row);
  }),

  // Escrow — env-gated the same way as course checkout (payments.ts): with no
  // payment gateway wired up, funding a milestone instantly moves it to
  // 'funded' rather than creating a real hold on a card. Swap in a real charge
  // + hold here when Razorpay/Stripe is configured.
  fundMilestone: protectedProcedure.input(milestoneIdInput).mutation(async ({ ctx, input }) => {
    const [milestone] = await db
      .select()
      .from(schema.contractMilestones)
      .where(eq(schema.contractMilestones.id, input.milestoneId))
      .limit(1);
    if (!milestone) throw new TRPCError({ code: "NOT_FOUND" });

    const [contract] = await db.select().from(schema.contracts).where(eq(schema.contracts.id, milestone.contractId)).limit(1);
    if (!contract || contract.employerId !== ctx.user.sub) throw new TRPCError({ code: "FORBIDDEN" });
    if (milestone.status !== "pending") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This milestone isn't pending funding." });
    }

    await db
      .update(schema.contractMilestones)
      .set({ status: "funded", fundedAt: new Date() })
      .where(eq(schema.contractMilestones.id, milestone.id));

    await notify(contract.talentId, "milestone_funded", {
      actorId: ctx.user.sub,
      actorName: await profileName(ctx.user.sub),
      contractId: contract.id,
      milestoneTitle: milestone.title,
      amountCents: milestone.amountCents,
    });

    return toContract(contract);
  }),

  releaseMilestone: protectedProcedure.input(milestoneIdInput).mutation(async ({ ctx, input }) => {
    const [milestone] = await db
      .select()
      .from(schema.contractMilestones)
      .where(eq(schema.contractMilestones.id, input.milestoneId))
      .limit(1);
    if (!milestone) throw new TRPCError({ code: "NOT_FOUND" });

    const [contract] = await db.select().from(schema.contracts).where(eq(schema.contracts.id, milestone.contractId)).limit(1);
    if (!contract || contract.employerId !== ctx.user.sub) throw new TRPCError({ code: "FORBIDDEN" });
    if (milestone.status !== "funded") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Fund this milestone before releasing it." });
    }

    await db
      .update(schema.contractMilestones)
      .set({ status: "released", releasedAt: new Date() })
      .where(eq(schema.contractMilestones.id, milestone.id));

    await notify(contract.talentId, "milestone_released", {
      actorId: ctx.user.sub,
      actorName: await profileName(ctx.user.sub),
      contractId: contract.id,
      milestoneTitle: milestone.title,
      amountCents: milestone.amountCents,
    });

    // If every milestone is released, the contract is complete.
    const allMilestones = await db
      .select()
      .from(schema.contractMilestones)
      .where(eq(schema.contractMilestones.contractId, contract.id));
    const allReleased = allMilestones.every((m) => m.id === milestone.id || m.status === "released");
    if (allReleased) {
      await db.update(schema.contracts).set({ status: "completed" }).where(eq(schema.contracts.id, contract.id));
    }

    const [refreshed] = await db.select().from(schema.contracts).where(eq(schema.contracts.id, contract.id)).limit(1);
    if (!refreshed) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return toContract(refreshed);
  }),
});
