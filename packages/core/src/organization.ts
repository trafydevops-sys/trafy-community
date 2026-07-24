import { z } from "zod";

export const orgRoleSchema = z.enum(["owner", "admin", "instructor"]);
export type OrgRole = z.infer<typeof orgRoleSchema>;

export const createOrganizationInput = z.object({
  name: z.string().trim().min(2).max(120),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationInput>;

export const getOrganizationInput = z.object({ organizationId: z.string().uuid() });
export type GetOrganizationInput = z.infer<typeof getOrganizationInput>;

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
  name: z.string(),
  slug: z.string(),
  ownerId: z.string().uuid(),
  myRole: orgRoleSchema,
  memberCount: z.number().int().nonnegative(),
  courseCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type Organization = z.infer<typeof organizationSchema>;

export const organizationDetailSchema = organizationSchema.extend({
  members: z.array(orgMemberSchema),
});
export type OrganizationDetail = z.infer<typeof organizationDetailSchema>;
