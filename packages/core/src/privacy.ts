import { z } from "zod";

export const profileVisibilitySchema = z.enum(["public", "private"]);
export type ProfileVisibility = z.infer<typeof profileVisibilitySchema>;

export const privacySettingsInput = z.object({
  profileVisibility: profileVisibilitySchema.default("public"),
  showEmail: z.boolean().default(false),
  showEducation: z.boolean().default(true),
  showExperience: z.boolean().default(true),
  showCertificates: z.boolean().default(true),
});
export type PrivacySettingsInput = z.infer<typeof privacySettingsInput>;

export const updatePrivacySettingsInput = privacySettingsInput.partial();
export type UpdatePrivacySettingsInput = z.infer<typeof updatePrivacySettingsInput>;

export const privacySettingsSchema = privacySettingsInput.extend({
  userId: z.string().uuid(),
  updatedAt: z.string(),
});
export type PrivacySettings = z.infer<typeof privacySettingsSchema>;
