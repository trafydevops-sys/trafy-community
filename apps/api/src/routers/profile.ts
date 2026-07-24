import { eq } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import {
  updatePrivacySettingsInput,
  updateProfileInput,
  type Certificate,
  type EducationEntry,
  type ExperienceEntry,
} from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";

export const profileRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.sub;
    const [profileRow] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1);
    const [privacyRow] = await db
      .select()
      .from(schema.privacySettings)
      .where(eq(schema.privacySettings.userId, userId))
      .limit(1);

    return {
      profile: profileRow
        ? {
            fullName: profileRow.fullName,
            bio: profileRow.bio ?? undefined,
            title: profileRow.title ?? undefined,
            education: profileRow.education as EducationEntry[],
            experience: profileRow.experience as ExperienceEntry[],
            certificates: profileRow.certificates as Certificate[],
            updatedAt: profileRow.updatedAt.toISOString(),
          }
        : null,
      privacy: privacyRow
        ? {
            profileVisibility: privacyRow.profileVisibility as "public" | "private",
            showEmail: privacyRow.showEmail,
            showEducation: privacyRow.showEducation,
            showExperience: privacyRow.showExperience,
            showCertificates: privacyRow.showCertificates,
          }
        : null,
    };
  }),

  update: protectedProcedure.input(updateProfileInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.sub;
    await db
      .insert(schema.profiles)
      .values({ userId, ...input, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.profiles.userId,
        set: { ...input, updatedAt: new Date() },
      });
    return { ok: true as const };
  }),

  updatePrivacy: protectedProcedure.input(updatePrivacySettingsInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.sub;
    await db
      .insert(schema.privacySettings)
      .values({ userId, ...input, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.privacySettings.userId,
        set: { ...input, updatedAt: new Date() },
      });
    return { ok: true as const };
  }),
});
