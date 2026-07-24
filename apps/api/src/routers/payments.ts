import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import {
  CREATOR_REVENUE_SHARE,
  checkoutInput,
  type CheckoutResult,
  type CourseEarnings,
  type EarningsSummary,
  type Payout,
  type Purchase,
  type RequestPayoutResult,
} from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";
import { notify } from "../lib/notify.js";

export const paymentsRouter = router({
  // No payment gateway is wired up yet (env-gated, like mail.ts/storage.ts) —
  // a "purchase" is recorded as paid immediately. Swap in Razorpay/Stripe
  // checkout-session creation + webhook confirmation here later; callers
  // (the frontend) already treat `stub: true` as "test payment" messaging.
  checkout: protectedProcedure.input(checkoutInput).mutation(async ({ ctx, input }) => {
    const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, input.courseId)).limit(1);
    if (!course || !course.published) throw new TRPCError({ code: "NOT_FOUND" });

    const [existingEnrollment] = await db
      .select()
      .from(schema.enrollments)
      .where(and(eq(schema.enrollments.courseId, course.id), eq(schema.enrollments.userId, ctx.user.sub)))
      .limit(1);
    if (existingEnrollment) {
      const result: CheckoutResult = { enrolled: true, amountCents: 0, currency: course.currency, stub: true };
      return result;
    }

    if (input.cohortId) {
      const [cohort] = await db.select().from(schema.cohorts).where(eq(schema.cohorts.id, input.cohortId)).limit(1);
      if (!cohort || cohort.courseId !== course.id) throw new TRPCError({ code: "NOT_FOUND", message: "Cohort not found." });
      if (cohort.capacity != null) {
        const seatRows = await db.select({ value: count() }).from(schema.enrollments).where(eq(schema.enrollments.cohortId, cohort.id));
        const enrolledCount = seatRows[0]?.value ?? 0;
        if (enrolledCount >= cohort.capacity) throw new TRPCError({ code: "BAD_REQUEST", message: "This cohort is full." });
      }
    }

    if (course.pricingType !== "free") {
      await db.insert(schema.payments).values({
        courseId: course.id,
        buyerId: ctx.user.sub,
        amountCents: course.priceCents,
        currency: course.currency,
        status: "paid",
        provider: "stub",
      });
    }

    await db.insert(schema.enrollments).values({ courseId: course.id, userId: ctx.user.sub, cohortId: input.cohortId });

    if (course.creatorId !== ctx.user.sub) {
      const [buyerProfile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, ctx.user.sub)).limit(1);
      await notify(course.creatorId, "course_sale", {
        actorId: ctx.user.sub,
        actorName: buyerProfile?.fullName || ctx.user.email,
        courseId: course.id,
        courseTitle: course.title,
        amountCents: course.priceCents,
      });
    }

    const result: CheckoutResult = {
      enrolled: true,
      amountCents: course.priceCents,
      currency: course.currency,
      stub: course.pricingType !== "free",
    };
    return result;
  }),

  myPurchases: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.buyerId, ctx.user.sub))
      .orderBy(desc(schema.payments.createdAt));

    const purchases: Purchase[] = await Promise.all(
      rows.map(async (row) => {
        const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, row.courseId)).limit(1);
        return {
          id: row.id,
          courseId: row.courseId,
          courseTitle: course?.title || "",
          amountCents: row.amountCents,
          currency: row.currency,
          status: row.status as Purchase["status"],
          createdAt: row.createdAt.toISOString(),
        };
      })
    );
    return purchases;
  }),

  creatorEarnings: protectedProcedure.query(async ({ ctx }) => {
    const myCourses = await db.select().from(schema.courses).where(eq(schema.courses.creatorId, ctx.user.sub));
    const currency = myCourses[0]?.currency ?? "usd";

    const byCourse: CourseEarnings[] = [];
    let availableCents = 0;
    let paidOutCents = 0;

    for (const course of myCourses) {
      const paidPayments = await db
        .select()
        .from(schema.payments)
        .where(and(eq(schema.payments.courseId, course.id), eq(schema.payments.status, "paid")));

      const grossCents = paidPayments.reduce((sum, p) => sum + p.amountCents, 0);
      const creatorShareCents = Math.round(grossCents * CREATOR_REVENUE_SHARE);
      if (grossCents > 0) {
        byCourse.push({ courseId: course.id, courseTitle: course.title, grossCents, creatorShareCents, salesCount: paidPayments.length });
      }

      for (const payment of paidPayments) {
        const share = Math.round(payment.amountCents * CREATOR_REVENUE_SHARE);
        if (payment.payoutId) paidOutCents += share;
        else availableCents += share;
      }
    }

    const summary: EarningsSummary = { currency, byCourse, availableCents, paidOutCents };
    return summary;
  }),

  requestPayout: protectedProcedure.mutation(async ({ ctx }) => {
    const myCourses = await db.select().from(schema.courses).where(eq(schema.courses.creatorId, ctx.user.sub));
    const currency = myCourses[0]?.currency ?? "usd";
    const courseIds = myCourses.map((c) => c.id);

    if (courseIds.length === 0) {
      const result: RequestPayoutResult = { payout: null };
      return result;
    }

    let totalShareCents = 0;
    const unallocatedPaymentIds: string[] = [];
    for (const courseId of courseIds) {
      const unallocated = await db
        .select()
        .from(schema.payments)
        .where(and(eq(schema.payments.courseId, courseId), eq(schema.payments.status, "paid"), isNull(schema.payments.payoutId)));
      for (const payment of unallocated) {
        totalShareCents += Math.round(payment.amountCents * CREATOR_REVENUE_SHARE);
        unallocatedPaymentIds.push(payment.id);
      }
    }

    if (unallocatedPaymentIds.length === 0) {
      const result: RequestPayoutResult = { payout: null };
      return result;
    }

    const [payoutRow] = await db
      .insert(schema.payouts)
      .values({ creatorId: ctx.user.sub, amountCents: totalShareCents, currency, status: "pending" })
      .returning();
    if (!payoutRow) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    await Promise.all(
      unallocatedPaymentIds.map((id) => db.update(schema.payments).set({ payoutId: payoutRow.id }).where(eq(schema.payments.id, id)))
    );

    const payout: Payout = {
      id: payoutRow.id,
      amountCents: payoutRow.amountCents,
      currency: payoutRow.currency,
      status: payoutRow.status as Payout["status"],
      createdAt: payoutRow.createdAt.toISOString(),
    };
    const result: RequestPayoutResult = { payout };
    return result;
  }),

  myPayouts: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(schema.payouts)
      .where(eq(schema.payouts.creatorId, ctx.user.sub))
      .orderBy(desc(schema.payouts.createdAt));

    const payouts: Payout[] = rows.map((row) => ({
      id: row.id,
      amountCents: row.amountCents,
      currency: row.currency,
      status: row.status as Payout["status"],
      createdAt: row.createdAt.toISOString(),
    }));
    return payouts;
  }),
});
