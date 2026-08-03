import { z } from "zod";

export const orgRoleSchema = z.enum(["owner", "admin", "instructor"]);
export type OrgRole = z.infer<typeof orgRoleSchema>;

export const orgTypeSchema = z.enum(["company", "institution"]);
export type OrgType = z.infer<typeof orgTypeSchema>;

export const createOrganizationInput = z.object({
  name: z.string().trim().min(2).max(120),
  type: orgTypeSchema.default("company"),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationInput>;

export const getOrganizationInput = z.object({ organizationId: z.string().uuid() });
export type GetOrganizationInput = z.infer<typeof getOrganizationInput>;

export const getPublicOrgInput = z.object({ slug: z.string().min(1) });
export type GetPublicOrgInput = z.infer<typeof getPublicOrgInput>;

export const addOrgMemberInput = z.object({
  organizationId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  role: orgRoleSchema.default("instructor"),
});
export type AddOrgMemberInput = z.infer<typeof addOrgMemberInput>;

export const updateOrgMemberRoleInput = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  role: orgRoleSchema,
});
export type UpdateOrgMemberRoleInput = z.infer<typeof updateOrgMemberRoleInput>;

export const removeOrgMemberInput = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
});
export type RemoveOrgMemberInput = z.infer<typeof removeOrgMemberInput>;

export const orgMemberSchema = z.object({
  userId: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  role: orgRoleSchema,
  joinedAt: z.string(),
});
export type OrgMember = z.infer<typeof orgMemberSchema>;

export const organizationSchema = z.object({
  id: z.string().uuid(),
  type: orgTypeSchema,
  name: z.string(),
  slug: z.string(),
  ownerId: z.string().uuid(),
  about: z.string().nullable(),
  logoUrl: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  website: z.string().nullable(),
  industry: z.string().nullable(),
  employeeRange: z.string().nullable(),
  location: z.string().nullable(),
  foundedYear: z.number().int().nullable(),
  linkedinUrl: z.string().nullable(),
  myRole: orgRoleSchema.optional(),
  memberCount: z.number().int().nonnegative(),
  courseCount: z.number().int().nonnegative(),
  jobCount: z.number().int().nonnegative(),
  postCount: z.number().int().nonnegative().optional(),
  createdAt: z.string(),
});
export type Organization = z.infer<typeof organizationSchema>;

export const updateOrganizationInput = z.object({
  organizationId: z.string().uuid(),
  about: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  bannerUrl: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  employeeRange: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  foundedYear: z.number().int().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationInput>;

export const publicOrgSchema = organizationSchema.omit({ myRole: true });
export type PublicOrg = z.infer<typeof publicOrgSchema>;

export const organizationDetailSchema = organizationSchema.extend({
  members: z.array(orgMemberSchema),
});
export type OrganizationDetail = z.infer<typeof organizationDetailSchema>;
