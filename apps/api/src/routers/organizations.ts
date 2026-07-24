import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import {
  addOrgMemberInput,
  createOrganizationInput,
  getOrganizationInput,
  removeOrgMemberInput,
  updateOrgMemberRoleInput,
  type Organization,
  type OrganizationDetail,
  type OrgMember,
  type OrgRole,
} from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";
import { notify } from "../lib/notify.js";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return base || "org";
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let suffix = 1;
  // Small orgs, small suffix space — a straightforward retry loop is fine here.
  while (true) {
    const [existing] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, slug)).limit(1);
    if (!existing) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

async function assertMember(organizationId: string, userId: string) {
  const [member] = await db
    .select()
    .from(schema.organizationMembers)
    .where(and(eq(schema.organizationMembers.organizationId, organizationId), eq(schema.organizationMembers.userId, userId)))
    .limit(1);
  if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization." });
  return member;
}

async function assertAdmin(organizationId: string, userId: string) {
  const member = await assertMember(organizationId, userId);
  if (member.role !== "owner" && member.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Owner/admin only." });
  }
  return member;
}

async function toOrganization(row: typeof schema.organizations.$inferSelect, myRole: OrgRole): Promise<Organization> {
  const memberRows = await db
    .select({ value: count() })
    .from(schema.organizationMembers)
    .where(eq(schema.organizationMembers.organizationId, row.id));
  const courseRows = await db.select({ value: count() }).from(schema.courses).where(eq(schema.courses.organizationId, row.id));

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    ownerId: row.ownerId,
    myRole,
    memberCount: memberRows[0]?.value ?? 0,
    courseCount: courseRows[0]?.value ?? 0,
    createdAt: row.createdAt.toISOString(),
  };
}

export const organizationsRouter = router({
  create: protectedProcedure.input(createOrganizationInput).mutation(async ({ ctx, input }) => {
    const slug = await uniqueSlug(slugify(input.name));
    const [org] = await db
      .insert(schema.organizations)
      .values({ name: input.name, slug, ownerId: ctx.user.sub })
      .returning();
    if (!org) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    await db.insert(schema.organizationMembers).values({ organizationId: org.id, userId: ctx.user.sub, role: "owner" });
    return toOrganization(org, "owner");
  }),

  myOrganizations: protectedProcedure.query(async ({ ctx }) => {
    const memberRows = await db
      .select()
      .from(schema.organizationMembers)
      .where(eq(schema.organizationMembers.userId, ctx.user.sub));

    const results = await Promise.all(
      memberRows.map(async (member) => {
        const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, member.organizationId)).limit(1);
        if (!org) return null;
        return toOrganization(org, member.role as OrgRole);
      })
    );
    return results.filter((r): r is Organization => r !== null);
  }),

  getById: protectedProcedure.input(getOrganizationInput).query(async ({ ctx, input }) => {
    const member = await assertMember(input.organizationId, ctx.user.sub);
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, input.organizationId)).limit(1);
    if (!org) throw new TRPCError({ code: "NOT_FOUND" });

    const memberRows = await db
      .select()
      .from(schema.organizationMembers)
      .where(eq(schema.organizationMembers.organizationId, org.id));

    const members: OrgMember[] = await Promise.all(
      memberRows.map(async (m) => {
        const [user] = await db.select().from(schema.users).where(eq(schema.users.id, m.userId)).limit(1);
        const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, m.userId)).limit(1);
        return {
          userId: m.userId,
          name: profile?.fullName || user?.email || "",
          email: user?.email ?? "",
          role: m.role as OrgRole,
          joinedAt: m.joinedAt.toISOString(),
        };
      })
    );

    const summary = await toOrganization(org, member.role as OrgRole);
    const detail: OrganizationDetail = { ...summary, members };
    return detail;
  }),

  addMember: protectedProcedure.input(addOrgMemberInput).mutation(async ({ ctx, input }) => {
    await assertAdmin(input.organizationId, ctx.user.sub);
    if (input.role === "owner") throw new TRPCError({ code: "BAD_REQUEST", message: "An organization can only have one owner." });

    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, input.email)).limit(1);
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "No Trafy account with that email yet." });

    const [existing] = await db
      .select()
      .from(schema.organizationMembers)
      .where(and(eq(schema.organizationMembers.organizationId, input.organizationId), eq(schema.organizationMembers.userId, user.id)))
      .limit(1);
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "Already a member." });

    await db.insert(schema.organizationMembers).values({ organizationId: input.organizationId, userId: user.id, role: input.role });

    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, input.organizationId)).limit(1);
    const [actorProfile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, ctx.user.sub)).limit(1);
    await notify(user.id, "org_invite", {
      actorId: ctx.user.sub,
      actorName: actorProfile?.fullName || ctx.user.email,
      organizationId: input.organizationId,
      organizationName: org?.name ?? "",
      role: input.role,
    });

    return { ok: true as const };
  }),

  updateMemberRole: protectedProcedure.input(updateOrgMemberRoleInput).mutation(async ({ ctx, input }) => {
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, input.organizationId)).limit(1);
    if (!org) throw new TRPCError({ code: "NOT_FOUND" });
    if (org.ownerId !== ctx.user.sub) throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can change roles." });
    if (input.userId === ctx.user.sub) throw new TRPCError({ code: "BAD_REQUEST", message: "Owner role can't be reassigned this way." });
    if (input.role === "owner") throw new TRPCError({ code: "BAD_REQUEST", message: "An organization can only have one owner." });

    await db
      .update(schema.organizationMembers)
      .set({ role: input.role })
      .where(and(eq(schema.organizationMembers.organizationId, input.organizationId), eq(schema.organizationMembers.userId, input.userId)));

    return { ok: true as const };
  }),

  removeMember: protectedProcedure.input(removeOrgMemberInput).mutation(async ({ ctx, input }) => {
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, input.organizationId)).limit(1);
    if (!org) throw new TRPCError({ code: "NOT_FOUND" });
    if (org.ownerId !== ctx.user.sub) throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can remove members." });
    if (input.userId === org.ownerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Can't remove the owner." });

    await db
      .delete(schema.organizationMembers)
      .where(and(eq(schema.organizationMembers.organizationId, input.organizationId), eq(schema.organizationMembers.userId, input.userId)));

    return { ok: true as const };
  }),
});
