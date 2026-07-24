import { z } from "zod";

// Creator keeps 80% of course revenue; platform keeps 20%. Single source of
// truth for both the earnings display and payout calculation.
export const CREATOR_REVENUE_SHARE = 0.8;

export const paymentStatusSchema = z.enum(["paid", "failed", "refunded"]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const checkoutInput = z.object({
  courseId: z.string().uuid(),
  // Optional — pick a scheduled cohort instead of enrolling self-paced.
  cohortId: z.string().uuid().optional(),
});
export type CheckoutInput = z.infer<typeof checkoutInput>;

export const checkoutResultSchema = z.object({
  enrolled: z.boolean(),
  amountCents: z.number().int().nonnegative(),
  currency: z.string(),
  // True when no payment gateway is configured — the "purchase" was completed
  // instantly by the dev stub rather than a real Razorpay/Stripe charge.
  stub: z.boolean(),
});
export type CheckoutResult = z.infer<typeof checkoutResultSchema>;

export const purchaseSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  courseTitle: z.string(),
  amountCents: z.number().int().nonnegative(),
  currency: z.string(),
  status: paymentStatusSchema,
  createdAt: z.string(),
});
export type Purchase = z.infer<typeof purchaseSchema>;

export const courseEarningsSchema = z.object({
  courseId: z.string().uuid(),
  courseTitle: z.string(),
  grossCents: z.number().int().nonnegative(),
  creatorShareCents: z.number().int().nonnegative(),
  salesCount: z.number().int().nonnegative(),
});
export type CourseEarnings = z.infer<typeof courseEarningsSchema>;

export const earningsSummarySchema = z.object({
  currency: z.string(),
  byCourse: z.array(courseEarningsSchema),
  availableCents: z.number().int().nonnegative(),
  paidOutCents: z.number().int().nonnegative(),
});
export type EarningsSummary = z.infer<typeof earningsSummarySchema>;

export const payoutStatusSchema = z.enum(["pending", "paid"]);
export type PayoutStatus = z.infer<typeof payoutStatusSchema>;

export const payoutSchema = z.object({
  id: z.string().uuid(),
  amountCents: z.number().int().nonnegative(),
  currency: z.string(),
  status: payoutStatusSchema,
  createdAt: z.string(),
});
export type Payout = z.infer<typeof payoutSchema>;

export const requestPayoutResultSchema = z.object({
  payout: payoutSchema.nullable(), // null when there was nothing available to withdraw
});
export type RequestPayoutResult = z.infer<typeof requestPayoutResultSchema>;
