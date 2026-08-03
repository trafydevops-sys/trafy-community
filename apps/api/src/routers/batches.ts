import { TRPCError } from "@trpc/server";
import { and, count, desc, eq } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import {
  createBatchInput,
  enrollBatchInput,
  updateBatchStatusInput,
  addPlacementInput,
  getOrganizationInput,
  type Batch,
  type PlacementStats,
} from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";

async function assertAdmin(organizationId: string, userId: string) {
  const [member] = await db
    .select()
    .from(schema.organizationMembers)
    .where(and(eq(schema.organizationMembers.organizationId, organizationId), eq(schema.organizationMembers.userId, userId)))
    .limit(1);
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Owner/admin only." });
  }
  return member;
}

export const batchesRouter = router({
  create: protectedProcedure.input(createBatchInput).mutation(async ({ ctx, input }) => {
    await assertAdmin(input.organizationId, ctx.user.sub);

    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, input.organizationId)).limit(1);
    if (!org || org.type !== "institution") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Only institutions can create batches." });
    }

    const [batch] = await db
      .insert(schema.batches)
      .values({
        organizationId: input.organizationId,
        name: input.name,
        description: input.description,
        startDate: new Date(input.startDate),
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        capacity: input.capacity,
      })
      .returning();
    
    if (!batch) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    
    return {
      id: batch.id,
      organizationId: batch.organizationId,
      name: batch.name,
      description: batch.description,
      startDate: batch.startDate.toISOString(),
      endDate: batch.endDate?.toISOString() ?? null,
      capacity: batch.capacity,
      studentCount: 0,
      completionRate: 0,
      placementRate: 0,
      createdAt: batch.createdAt.toISOString(),
    } as Batch;
  }),

  list: protectedProcedure.input(getOrganizationInput).query(async ({ input }) => {
    const batchRows = await db.select().from(schema.batches).where(eq(schema.batches.organizationId, input.organizationId)).orderBy(desc(schema.batches.createdAt));
    
    const batches = await Promise.all(batchRows.map(async (b) => {
      const studentCountQuery = await db.select({ value: count() }).from(schema.batchEnrollments).where(eq(schema.batchEnrollments.batchId, b.id));
      const studentCount = studentCountQuery[0]?.value ?? 0;

      const completedCountQuery = await db.select({ value: count() }).from(schema.batchEnrollments).where(and(eq(schema.batchEnrollments.batchId, b.id), eq(schema.batchEnrollments.status, "completed")));
      const completedCount = completedCountQuery[0]?.value ?? 0;

      const placedCountQuery = await db.select({ value: count() }).from(schema.placementRecords).where(eq(schema.placementRecords.batchId, b.id));
      const placedCount = placedCountQuery[0]?.value ?? 0;

      return {
        id: b.id,
        organizationId: b.organizationId,
        name: b.name,
        description: b.description,
        startDate: b.startDate.toISOString(),
        endDate: b.endDate?.toISOString() ?? null,
        capacity: b.capacity,
        studentCount,
        completionRate: studentCount > 0 ? (completedCount / studentCount) * 100 : 0,
        placementRate: studentCount > 0 ? (placedCount / studentCount) * 100 : 0,
        createdAt: b.createdAt.toISOString(),
      } as Batch;
    }));
    return batches;
  }),

  enroll: protectedProcedure.input(enrollBatchInput).mutation(async ({ ctx, input }) => {
    const [batch] = await db.select().from(schema.batches).where(eq(schema.batches.id, input.batchId)).limit(1);
    if (!batch) throw new TRPCError({ code: "NOT_FOUND" });

    if (batch.capacity) {
      const studentCountQuery = await db.select({ value: count() }).from(schema.batchEnrollments).where(eq(schema.batchEnrollments.batchId, batch.id));
      const studentCount = studentCountQuery[0]?.value ?? 0;
      if (studentCount >= batch.capacity) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Batch is at full capacity." });
      }
    }

    const [existing] = await db.select().from(schema.batchEnrollments).where(and(eq(schema.batchEnrollments.batchId, batch.id), eq(schema.batchEnrollments.userId, ctx.user.sub))).limit(1);
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "Already enrolled." });

    await db.insert(schema.batchEnrollments).values({
      batchId: batch.id,
      userId: ctx.user.sub,
      status: "enrolled",
    });

    return { ok: true as const };
  }),

  updateStatus: protectedProcedure.input(updateBatchStatusInput).mutation(async ({ ctx, input }) => {
    const [batch] = await db.select().from(schema.batches).where(eq(schema.batches.id, input.batchId)).limit(1);
    if (!batch) throw new TRPCError({ code: "NOT_FOUND" });
    
    await assertAdmin(batch.organizationId, ctx.user.sub);

    await db.update(schema.batchEnrollments).set({ status: input.status }).where(and(eq(schema.batchEnrollments.batchId, input.batchId), eq(schema.batchEnrollments.userId, input.userId)));
    return { ok: true as const };
  }),

  addPlacement: protectedProcedure.input(addPlacementInput).mutation(async ({ ctx, input }) => {
    const [batch] = await db.select().from(schema.batches).where(eq(schema.batches.id, input.batchId)).limit(1);
    if (!batch) throw new TRPCError({ code: "NOT_FOUND" });
    
    await assertAdmin(batch.organizationId, ctx.user.sub);

    const [existing] = await db.select().from(schema.placementRecords).where(and(eq(schema.placementRecords.batchId, input.batchId), eq(schema.placementRecords.userId, input.userId))).limit(1);
    if (existing) {
      throw new TRPCError({ code: "CONFLICT", message: "Placement already recorded for this user in this batch." });
    }

    await db.insert(schema.placementRecords).values({
      batchId: input.batchId,
      userId: input.userId,
      companyName: input.companyName,
      role: input.role,
      packageLpa: input.packageLpa,
    });

    return { ok: true as const };
  }),

  placementStats: protectedProcedure.input(getOrganizationInput).query(async ({ ctx, input }) => {
    // Only admins can see placement stats in this implementation (per PRD open questions).
    await assertAdmin(input.organizationId, ctx.user.sub);

    const batchRows = await db.select().from(schema.batches).where(eq(schema.batches.organizationId, input.organizationId));
    const batchIds = batchRows.map(b => b.id);

    if (batchIds.length === 0) {
      return { totalStudents: 0, placed: 0, placementRate: 0, avgPackageLpa: null, topCompanies: [] } as PlacementStats;
    }

    let totalStudents = 0;
    for (const id of batchIds) {
      const q = await db.select({ value: count() }).from(schema.batchEnrollments).where(eq(schema.batchEnrollments.batchId, id));
      totalStudents += q[0]?.value ?? 0;
    }

    let placed = 0;
    let totalLpa = 0;
    let countLpa = 0;
    const companies = new Map<string, number>();

    for (const id of batchIds) {
      const records = await db.select().from(schema.placementRecords).where(eq(schema.placementRecords.batchId, id));
      placed += records.length;
      for (const r of records) {
        if (r.packageLpa) {
          totalLpa += r.packageLpa;
          countLpa++;
        }
        companies.set(r.companyName, (companies.get(r.companyName) ?? 0) + 1);
      }
    }

    const topCompanies = Array.from(companies.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(c => c[0]);

    return {
      totalStudents,
      placed,
      placementRate: totalStudents > 0 ? (placed / totalStudents) * 100 : 0,
      avgPackageLpa: countLpa > 0 ? totalLpa / countLpa : null,
      topCompanies,
    } as PlacementStats;
  }),
});
