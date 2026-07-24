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

// Step-by-step Profile Creation wizard, mirroring the wireframe fields
// (full name, email, bio, title, education, experience, certificates).
export const profileWizardInput = z.object({
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
