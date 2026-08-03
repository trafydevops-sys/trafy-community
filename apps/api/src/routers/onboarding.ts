import { z } from "zod";
import { eq } from "drizzle-orm";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";
import { schema } from "@trafy-community/db";
import { USER_ROLES, ONBOARDING_GOALS } from "@trafy-community/core";
import { parseResume } from "../lib/resume-parser.js";

export const onboardingRouter = router({
  parseResume: protectedProcedure
    .input(z.object({ resumeUrl: z.string().url() }))
    .mutation(async ({ input }) => {
      return parseResume(input.resumeUrl);
    }),

  saveState: protectedProcedure
    .input(z.object({
      userRole: z.enum(USER_ROLES).optional(),
      goals: z.array(z.enum(ONBOARDING_GOALS)).optional(),
      resumeUrl: z.string().optional(),
      onboardingCompleted: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;
      await db
        .insert(schema.profiles)
        .values({ userId, ...input, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.profiles.userId,
          set: { ...input, updatedAt: new Date() },
        });
      return { ok: true };
    }),

  getState: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.sub;
    const [profile] = await db
      .select({
        userRole: schema.profiles.userRole,
        goals: schema.profiles.goals,
        resumeUrl: schema.profiles.resumeUrl,
        onboardingCompleted: schema.profiles.onboardingCompleted,
      })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId))
      .limit(1);
    
    return profile || null;
  }),
});
