import { z } from "zod";

export const educationEntrySchema = z.object({
  id: z.string().uuid().optional(),
  institution: z.string().trim().min(1).max(200),
  degree: z.string().trim().max(200).optional(),
  field: z.string().trim().max(200).optional(),
  startYear: z.number().int().gte(1950).lte(2100),
  endYear: z.number().int().gte(1950).lte(2100).optional(),
});
export type EducationEntry = z.infer<typeof educationEntrySchema>;

export const experienceEntrySchema = z.object({
  id: z.string().uuid().optional(),
  company: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(200),
  startDate: z.string().date(),
  endDate: z.string().date().optional(),
  description: z.string().trim().max(2000).optional(),
});
export type ExperienceEntry = z.infer<typeof experienceEntrySchema>;

export const certificateSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(200),
  fileUrl: z.string().min(1),
  issuedBy: z.string().trim().max(200).optional(),
  issuedAt: z.string().date().optional(),
});
export type Certificate = z.infer<typeof certificateSchema>;

export const USER_ROLES = ["talent", "recruiter", "instructor", "institution"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ONBOARDING_GOALS = ["get-a-job", "upskill", "switch-track", "hire", "teach", "learn-ai"] as const;
export type OnboardingGoal = (typeof ONBOARDING_GOALS)[number];

// A naive mapping from goal to suggested track, just for onboarding personalization.
export const GOAL_TO_TRACK: Record<OnboardingGoal, string | null> = {
  "get-a-job": "backend",
  "upskill": "frontend",
  "switch-track": "data",
  "learn-ai": "ai",
  "hire": null,
  "teach": null,
};

// Step-by-step Profile Creation wizard, mirroring the wireframe fields
// (full name, email, bio, title, education, experience, certificates).
export const profileWizardInput = z.object({
  userRole: z.enum(USER_ROLES).optional(),
  goals: z.array(z.enum(ONBOARDING_GOALS)).default([]),
  resumeUrl: z.string().optional(),
  onboardingCompleted: z.boolean().default(false),
  fullName: z.string().trim().min(1).max(120),
  bio: z.string().trim().max(1000).optional(),
  title: z.string().trim().max(160).optional(),
  education: z.array(educationEntrySchema).max(20).default([]),
  experience: z.array(experienceEntrySchema).max(30).default([]),
  certificates: z.array(certificateSchema).max(30).default([]),
});
export type ProfileWizardInput = z.infer<typeof profileWizardInput>;

export const updateProfileInput = profileWizardInput.partial();
export type UpdateProfileInput = z.infer<typeof updateProfileInput>;

export const profileSchema = profileWizardInput.extend({
  userId: z.string().uuid(),
  email: z.string().email(),
  updatedAt: z.string(),
});
export type Profile = z.infer<typeof profileSchema>;

// Privacy settings (privacySettingsSchema / updatePrivacySettingsInput) live in
// ./privacy.ts, not here — this used to have its own duplicate copy (a 3-way
// "connections" visibility enum the DB schema's plain `text` column and every
// call site disagreed with) which collided with privacy.ts's exports in the
// index.ts barrel. Removed as dead, unwired code rather than reconciled.
