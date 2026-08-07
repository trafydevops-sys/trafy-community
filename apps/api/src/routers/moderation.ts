import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { schema } from "@trafy-community/db";
import {
  AUTO_SUSPEND_DURATION_DAYS,
  AUTO_SUSPEND_VIOLATION_THRESHOLD,
  adjustTrustScoreInput,
  banUserInput,
  getModUserInput,
  getReportInput,
  hidePostInput,
  listAppealsInput,
  listAuditLogInput,
  listIntegrityFlagsInput,
  listModUsersInput,
  listReportsInput,
  resolveAppealInput,
  resolveIntegrityFlagInput,
  resolveReportInput,
  restorePostInput,
  submitAccountAppealInput,
  suspendUserInput,
  unbanUserInput,
  unsuspendUserInput,
  warnUserInput,
  type Appeal,
  type ModerationAction,
  type ModIntegrityFlag,
  type ModUserDetail,
  type ModUserSummary,
  type MyStanding,
  type ReportSummary,
  type UserStatus,
  type UserWarning,
} from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";
import { notify } from "../lib/notify.js";
import { requireAdmin } from "../lib/auth-helpers.js";
import { revokeAllRefreshTokensFor } from "../lib/tokens.js";
import { syncExpiredSuspension } from "../lib/account-status.js";

async function fullName(userId: string): Promise<string> {
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1);
  return profile?.fullName || "";
}

function toAction(row: typeof schema.moderationActions.$inferSelect, adminName: string): ModerationAction {
  return {
    id: row.id,
    adminId: row.adminId,
    adminName,
    targetUserId: row.targetUserId,
    targetPostId: row.targetPostId,
    actionType: row.actionType as ModerationAction["actionType"],
    reason: row.reason,
    detail: (row.detail as Record<string, unknown>) ?? {},
    createdAt: row.createdAt.toISOString(),
  };
}

async function logAction(input: {
  adminId: string;
  targetUserId?: string | null;
  targetPostId?: string | null;
  actionType: ModerationAction["actionType"];
  reason?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(schema.moderationActions).values({
    adminId: input.adminId,
    targetUserId: input.targetUserId ?? null,
    targetPostId: input.targetPostId ?? null,
    actionType: input.actionType,
    reason: input.reason ?? null,
    detail: input.detail ?? {},
  });
}

function guardNotSelf(adminId: string, targetUserId: string): void {
  if (adminId === targetUserId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "You can't take moderation actions against your own account." });
  }
}

export const moderationRouter = router({
  // ────────────────────────────────────────────────────────
  // Dashboard
  // ────────────────────────────────────────────────────────
  getDashboardStats: protectedProcedure.query(async ({ ctx }) => {
    await requireAdmin(ctx.user.sub);

    const [[pendingReports], [suspendedUsers], [bannedUsers], [pendingAppeals], [unresolvedFlags], recentRows] =
      await Promise.all([
        db.select({ count: sql<number>`cast(count(*) as int)` }).from(schema.postReports).where(eq(schema.postReports.status, "pending")),
        db.select({ count: sql<number>`cast(count(*) as int)` }).from(schema.users).where(eq(schema.users.status, "suspended")),
        db.select({ count: sql<number>`cast(count(*) as int)` }).from(schema.users).where(eq(schema.users.status, "banned")),
        db.select({ count: sql<number>`cast(count(*) as int)` }).from(schema.modAppeals).where(eq(schema.modAppeals.status, "pending")),
        db.select({ count: sql<number>`cast(count(*) as int)` }).from(schema.integrityFlags).where(isNull(schema.integrityFlags.resolution)),
        db
          .select({ action: schema.moderationActions, adminName: schema.profiles.fullName })
          .from(schema.moderationActions)
          .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.moderationActions.adminId))
          .orderBy(desc(schema.moderationActions.createdAt))
          .limit(10),
      ]);

    return {
      pendingReports: pendingReports?.count ?? 0,
      suspendedUsers: suspendedUsers?.count ?? 0,
      bannedUsers: bannedUsers?.count ?? 0,
      pendingAppeals: pendingAppeals?.count ?? 0,
      unresolvedIntegrityFlags: unresolvedFlags?.count ?? 0,
      recentActions: recentRows.map((r) => toAction(r.action, r.adminName || "")),
    };
  }),

  // ────────────────────────────────────────────────────────
  // Reports
  // ────────────────────────────────────────────────────────
  listReports: protectedProcedure.input(listReportsInput).query(async ({ ctx, input }) => {
    await requireAdmin(ctx.user.sub);

    let cursorCreatedAt: Date | undefined;
    if (input.cursor) {
      const [cursorRow] = await db
        .select({ createdAt: schema.postReports.createdAt })
        .from(schema.postReports)
        .where(eq(schema.postReports.id, input.cursor))
        .limit(1);
      cursorCreatedAt = cursorRow?.createdAt;
    }

    const statusCondition = input.status ? eq(schema.postReports.status, input.status) : undefined;
    const whereClause = cursorCreatedAt
      ? and(statusCondition, lt(schema.postReports.createdAt, cursorCreatedAt))
      : statusCondition;

    const authorProfiles = alias(schema.profiles, "report_author_profiles");
    const reporterProfiles = alias(schema.profiles, "report_reporter_profiles");

    const rows = await db
      .select({ report: schema.postReports, post: schema.posts, authorFullName: authorProfiles.fullName, reporterFullName: reporterProfiles.fullName })
      .from(schema.postReports)
      .innerJoin(schema.posts, eq(schema.posts.id, schema.postReports.postId))
      .leftJoin(authorProfiles, eq(authorProfiles.userId, schema.posts.authorId))
      .leftJoin(reporterProfiles, eq(reporterProfiles.userId, schema.postReports.reporterId))
      .where(whereClause)
      .orderBy(desc(schema.postReports.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
    const postIds = [...new Set(pageRows.map((r) => r.post.id))];

    const counts = postIds.length
      ? await db
          .select({ postId: schema.postReports.postId, count: sql<number>`cast(count(*) as int)` })
          .from(schema.postReports)
          .where(inArray(schema.postReports.postId, postIds))
          .groupBy(schema.postReports.postId)
      : [];
    const countByPost = new Map(counts.map((c) => [c.postId, c.count]));

    const reports: ReportSummary[] = pageRows.map((r) => ({
      id: r.report.id,
      postId: r.post.id,
      postBody: r.post.body,
      postHiddenAt: r.post.hiddenAt ? r.post.hiddenAt.toISOString() : null,
      postAuthor: { id: r.post.authorId, fullName: r.authorFullName || "" },
      reporter: { id: r.report.reporterId, fullName: r.reporterFullName || "" },
      reason: r.report.reason,
      status: r.report.status as ReportSummary["status"],
      reportCount: countByPost.get(r.post.id) ?? 1,
      createdAt: r.report.createdAt.toISOString(),
    }));

    return { reports, nextCursor: hasMore ? pageRows[pageRows.length - 1]?.report.id : undefined };
  }),

  getReport: protectedProcedure.input(getReportInput).query(async ({ ctx, input }) => {
    await requireAdmin(ctx.user.sub);

    const [report] = await db.select().from(schema.postReports).where(eq(schema.postReports.id, input.reportId)).limit(1);
    if (!report) throw new TRPCError({ code: "NOT_FOUND" });

    const [post] = await db.select().from(schema.posts).where(eq(schema.posts.id, report.postId)).limit(1);
    if (!post) throw new TRPCError({ code: "NOT_FOUND" });

    const allReports = await db
      .select()
      .from(schema.postReports)
      .where(eq(schema.postReports.postId, report.postId))
      .orderBy(desc(schema.postReports.createdAt));

    const [authorFullName, reports] = await Promise.all([
      fullName(post.authorId),
      Promise.all(
        allReports.map(async (r) => ({
          id: r.id,
          reporterId: r.reporterId,
          reporterFullName: await fullName(r.reporterId),
          reason: r.reason,
          status: r.status as ReportSummary["status"],
          createdAt: r.createdAt.toISOString(),
        }))
      ),
    ]);

    return {
      post: {
        id: post.id,
        body: post.body,
        kind: post.kind,
        mediaUrl: post.mediaUrl,
        hiddenAt: post.hiddenAt ? post.hiddenAt.toISOString() : null,
        hiddenReason: post.hiddenReason,
        createdAt: post.createdAt.toISOString(),
        author: { id: post.authorId, fullName: authorFullName },
      },
      reports,
    };
  }),

  resolveReport: protectedProcedure.input(resolveReportInput).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.user.sub);

    const [report] = await db.select().from(schema.postReports).where(eq(schema.postReports.id, input.reportId)).limit(1);
    if (!report) throw new TRPCError({ code: "NOT_FOUND" });

    if (input.action === "dismiss") {
      await db
        .update(schema.postReports)
        .set({ status: "dismissed", resolvedBy: ctx.user.sub, resolvedAt: new Date(), resolutionNote: input.note })
        .where(eq(schema.postReports.id, input.reportId));
      await logAction({ adminId: ctx.user.sub, targetPostId: report.postId, actionType: "dismiss_report", reason: input.note });
      return { ok: true as const };
    }

    // hide_post — hides the underlying post and closes out every pending
    // report against it in one sweep.
    const [post] = await db.select().from(schema.posts).where(eq(schema.posts.id, report.postId)).limit(1);
    if (!post) throw new TRPCError({ code: "NOT_FOUND" });

    await db
      .update(schema.posts)
      .set({ hiddenAt: new Date(), hiddenReason: input.note || "Reported content" })
      .where(eq(schema.posts.id, report.postId));

    await db
      .update(schema.postReports)
      .set({ status: "actioned", resolvedBy: ctx.user.sub, resolvedAt: new Date(), resolutionNote: input.note })
      .where(and(eq(schema.postReports.postId, report.postId), eq(schema.postReports.status, "pending")));

    await logAction({ adminId: ctx.user.sub, targetPostId: report.postId, targetUserId: post.authorId, actionType: "resolve_report", reason: input.note });
    await logAction({ adminId: ctx.user.sub, targetPostId: report.postId, targetUserId: post.authorId, actionType: "hide_post", reason: input.note });

    if (post.authorId !== ctx.user.sub) {
      await notify(post.authorId, "report_resolved", { postId: post.id, action: "hidden", reason: input.note });
    }

    return { ok: true as const };
  }),

  hidePost: protectedProcedure.input(hidePostInput).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.user.sub);
    const [post] = await db.select().from(schema.posts).where(eq(schema.posts.id, input.postId)).limit(1);
    if (!post) throw new TRPCError({ code: "NOT_FOUND" });

    await db.update(schema.posts).set({ hiddenAt: new Date(), hiddenReason: input.reason }).where(eq(schema.posts.id, input.postId));
    await logAction({ adminId: ctx.user.sub, targetPostId: input.postId, targetUserId: post.authorId, actionType: "hide_post", reason: input.reason });
    if (post.authorId !== ctx.user.sub) {
      await notify(post.authorId, "report_resolved", { postId: post.id, action: "hidden", reason: input.reason });
    }
    return { ok: true as const };
  }),

  restorePost: protectedProcedure.input(restorePostInput).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.user.sub);
    const [post] = await db.select().from(schema.posts).where(eq(schema.posts.id, input.postId)).limit(1);
    if (!post) throw new TRPCError({ code: "NOT_FOUND" });

    await db.update(schema.posts).set({ hiddenAt: null, hiddenReason: null }).where(eq(schema.posts.id, input.postId));
    await logAction({ adminId: ctx.user.sub, targetPostId: input.postId, targetUserId: post.authorId, actionType: "restore_post" });
    return { ok: true as const };
  }),

  // ────────────────────────────────────────────────────────
  // Users
  // ────────────────────────────────────────────────────────
  listUsers: protectedProcedure.input(listModUsersInput).query(async ({ ctx, input }) => {
    await requireAdmin(ctx.user.sub);

    let cursorCreatedAt: Date | undefined;
    if (input.cursor) {
      const [cursorRow] = await db.select({ createdAt: schema.users.createdAt }).from(schema.users).where(eq(schema.users.id, input.cursor)).limit(1);
      cursorCreatedAt = cursorRow?.createdAt;
    }

    const conditions = [];
    if (input.status) conditions.push(eq(schema.users.status, input.status));
    if (input.query) {
      const q = `%${input.query.trim()}%`;
      conditions.push(or(ilike(schema.users.email, q), ilike(schema.profiles.fullName, q)));
    }
    if (cursorCreatedAt) conditions.push(lt(schema.users.createdAt, cursorCreatedAt));
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select({ user: schema.users, fullName: schema.profiles.fullName })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id))
      .where(whereClause)
      .orderBy(desc(schema.users.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
    const userIds = pageRows.map((r) => r.user.id);

    const [warningCounts, reportCounts] = userIds.length
      ? await Promise.all([
          db
            .select({ userId: schema.userWarnings.userId, count: sql<number>`cast(count(*) as int)` })
            .from(schema.userWarnings)
            .where(inArray(schema.userWarnings.userId, userIds))
            .groupBy(schema.userWarnings.userId),
          db
            .select({ authorId: schema.posts.authorId, count: sql<number>`cast(count(*) as int)` })
            .from(schema.postReports)
            .innerJoin(schema.posts, eq(schema.posts.id, schema.postReports.postId))
            .where(inArray(schema.posts.authorId, userIds))
            .groupBy(schema.posts.authorId),
        ])
      : [[], []];
    const warningByUser = new Map(warningCounts.map((w) => [w.userId, w.count]));
    const reportByUser = new Map(reportCounts.map((r) => [r.authorId, r.count]));

    const users: ModUserSummary[] = pageRows.map((r) => ({
      id: r.user.id,
      email: r.user.email,
      fullName: r.fullName || "",
      status: r.user.status as UserStatus,
      trustScore: r.user.trustScore,
      suspendedUntil: r.user.suspendedUntil ? r.user.suspendedUntil.toISOString() : null,
      warningCount: warningByUser.get(r.user.id) ?? 0,
      reportCount: reportByUser.get(r.user.id) ?? 0,
      createdAt: r.user.createdAt.toISOString(),
    }));

    return { users, nextCursor: hasMore ? pageRows[pageRows.length - 1]?.user.id : undefined };
  }),

  getUser: protectedProcedure.input(getModUserInput).query(async ({ ctx, input }) => {
    await requireAdmin(ctx.user.sub);

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, input.userId)).limit(1);
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, input.userId)).limit(1);

    const warningRows = await db
      .select()
      .from(schema.userWarnings)
      .where(eq(schema.userWarnings.userId, input.userId))
      .orderBy(desc(schema.userWarnings.createdAt));
    const warnings: UserWarning[] = await Promise.all(
      warningRows.map(async (w) => ({
        id: w.id,
        reason: w.reason,
        severity: w.severity as UserWarning["severity"],
        issuedBy: w.issuedBy,
        issuedByName: await fullName(w.issuedBy),
        createdAt: w.createdAt.toISOString(),
      }))
    );

    const actionRows = await db
      .select({ action: schema.moderationActions, adminName: schema.profiles.fullName })
      .from(schema.moderationActions)
      .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.moderationActions.adminId))
      .where(eq(schema.moderationActions.targetUserId, input.userId))
      .orderBy(desc(schema.moderationActions.createdAt))
      .limit(50);
    const actions = actionRows.map((r) => toAction(r.action, r.adminName || ""));

    const [reportCountRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(schema.postReports)
      .innerJoin(schema.posts, eq(schema.posts.id, schema.postReports.postId))
      .where(eq(schema.posts.authorId, input.userId));

    const [violationRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(schema.integrityFlags)
      .where(and(eq(schema.integrityFlags.userId, input.userId), eq(schema.integrityFlags.severity, "critical"), eq(schema.integrityFlags.resolution, "upheld")));

    const detail: ModUserDetail = {
      id: user.id,
      email: user.email,
      fullName: profile?.fullName || "",
      status: user.status as UserStatus,
      trustScore: user.trustScore,
      suspendedUntil: user.suspendedUntil ? user.suspendedUntil.toISOString() : null,
      warningCount: warnings.length,
      reportCount: reportCountRow?.count ?? 0,
      createdAt: user.createdAt.toISOString(),
      statusReason: user.statusReason,
      warnings,
      actions,
      integrityViolationCount: violationRow?.count ?? 0,
    };
    return detail;
  }),

  warnUser: protectedProcedure.input(warnUserInput).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.user.sub);
    guardNotSelf(ctx.user.sub, input.userId);

    const [target] = await db.select().from(schema.users).where(eq(schema.users.id, input.userId)).limit(1);
    if (!target) throw new TRPCError({ code: "NOT_FOUND" });

    await db.insert(schema.userWarnings).values({ userId: input.userId, reason: input.reason, severity: input.severity, issuedBy: ctx.user.sub });
    await logAction({ adminId: ctx.user.sub, targetUserId: input.userId, actionType: "warn", reason: input.reason, detail: { severity: input.severity } });
    await notify(input.userId, "user_warned", { reason: input.reason, severity: input.severity });
    return { ok: true as const };
  }),

  suspendUser: protectedProcedure.input(suspendUserInput).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.user.sub);
    guardNotSelf(ctx.user.sub, input.userId);

    const [target] = await db.select().from(schema.users).where(eq(schema.users.id, input.userId)).limit(1);
    if (!target) throw new TRPCError({ code: "NOT_FOUND" });

    const suspendedUntil = new Date(Date.now() + input.durationDays * 24 * 60 * 60 * 1000);
    await db
      .update(schema.users)
      .set({ status: "suspended", suspendedUntil, statusReason: input.reason, statusChangedBy: ctx.user.sub, statusChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.users.id, input.userId));
    await revokeAllRefreshTokensFor(input.userId);
    await logAction({ adminId: ctx.user.sub, targetUserId: input.userId, actionType: "suspend", reason: input.reason, detail: { durationDays: input.durationDays } });
    await notify(input.userId, "user_suspended", { reason: input.reason, suspendedUntil: suspendedUntil.toISOString() });
    return { ok: true as const, suspendedUntil: suspendedUntil.toISOString() };
  }),

  unsuspendUser: protectedProcedure.input(unsuspendUserInput).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.user.sub);
    const [target] = await db.select().from(schema.users).where(eq(schema.users.id, input.userId)).limit(1);
    if (!target) throw new TRPCError({ code: "NOT_FOUND" });

    await db
      .update(schema.users)
      .set({ status: "active", suspendedUntil: null, statusReason: null, statusChangedBy: ctx.user.sub, statusChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.users.id, input.userId));
    await logAction({ adminId: ctx.user.sub, targetUserId: input.userId, actionType: "unsuspend" });
    await notify(input.userId, "user_unsuspended", {});
    return { ok: true as const };
  }),

  banUser: protectedProcedure.input(banUserInput).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.user.sub);
    guardNotSelf(ctx.user.sub, input.userId);

    const [target] = await db.select().from(schema.users).where(eq(schema.users.id, input.userId)).limit(1);
    if (!target) throw new TRPCError({ code: "NOT_FOUND" });

    await db
      .update(schema.users)
      .set({ status: "banned", suspendedUntil: null, statusReason: input.reason, statusChangedBy: ctx.user.sub, statusChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.users.id, input.userId));
    await revokeAllRefreshTokensFor(input.userId);
    await logAction({ adminId: ctx.user.sub, targetUserId: input.userId, actionType: "ban", reason: input.reason });
    await notify(input.userId, "user_banned", { reason: input.reason });
    return { ok: true as const };
  }),

  unbanUser: protectedProcedure.input(unbanUserInput).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.user.sub);
    const [target] = await db.select().from(schema.users).where(eq(schema.users.id, input.userId)).limit(1);
    if (!target) throw new TRPCError({ code: "NOT_FOUND" });

    await db
      .update(schema.users)
      .set({ status: "active", statusReason: null, statusChangedBy: ctx.user.sub, statusChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.users.id, input.userId));
    await logAction({ adminId: ctx.user.sub, targetUserId: input.userId, actionType: "unban" });
    await notify(input.userId, "user_unsuspended", {});
    return { ok: true as const };
  }),

  adjustTrustScore: protectedProcedure.input(adjustTrustScoreInput).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.user.sub);
    guardNotSelf(ctx.user.sub, input.userId);

    const [target] = await db.select().from(schema.users).where(eq(schema.users.id, input.userId)).limit(1);
    if (!target) throw new TRPCError({ code: "NOT_FOUND" });

    const newScore = Math.max(0, Math.min(100, target.trustScore + input.delta));
    await db.update(schema.users).set({ trustScore: newScore, updatedAt: new Date() }).where(eq(schema.users.id, input.userId));
    await logAction({ adminId: ctx.user.sub, targetUserId: input.userId, actionType: "trust_score_adjust", reason: input.reason, detail: { delta: input.delta, newScore } });
    return { ok: true as const, newScore };
  }),

  // ────────────────────────────────────────────────────────
  // Self-service standing & appeals
  // ────────────────────────────────────────────────────────
  myStanding: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, ctx.user.sub)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    const user = await syncExpiredSuspension(row);

    const [pending] = await db
      .select({ id: schema.modAppeals.id })
      .from(schema.modAppeals)
      .where(and(eq(schema.modAppeals.userId, ctx.user.sub), eq(schema.modAppeals.status, "pending")))
      .limit(1);

    const standing: MyStanding = {
      status: user.status as UserStatus,
      statusReason: row.statusReason,
      suspendedUntil: user.suspendedUntil ? user.suspendedUntil.toISOString() : null,
      trustScore: row.trustScore,
      hasPendingAppeal: Boolean(pending),
    };
    return standing;
  }),

  submitAppeal: protectedProcedure.input(submitAccountAppealInput).mutation(async ({ ctx, input }) => {
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, ctx.user.sub)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    const user = await syncExpiredSuspension(row);
    if (user.status === "active") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Your account isn't currently restricted." });
    }

    const [existing] = await db
      .select({ id: schema.modAppeals.id })
      .from(schema.modAppeals)
      .where(and(eq(schema.modAppeals.userId, ctx.user.sub), eq(schema.modAppeals.status, "pending")))
      .limit(1);
    if (existing) {
      throw new TRPCError({ code: "CONFLICT", message: "You already have a pending appeal." });
    }

    await db.insert(schema.modAppeals).values({ userId: ctx.user.sub, reason: input.reason });
    return { ok: true as const };
  }),

  // ────────────────────────────────────────────────────────
  // Appeals (admin)
  // ────────────────────────────────────────────────────────
  listAppeals: protectedProcedure.input(listAppealsInput).query(async ({ ctx, input }) => {
    await requireAdmin(ctx.user.sub);

    let cursorCreatedAt: Date | undefined;
    if (input.cursor) {
      const [cursorRow] = await db.select({ createdAt: schema.modAppeals.createdAt }).from(schema.modAppeals).where(eq(schema.modAppeals.id, input.cursor)).limit(1);
      cursorCreatedAt = cursorRow?.createdAt;
    }
    const statusCondition = input.status ? eq(schema.modAppeals.status, input.status) : undefined;
    const whereClause = cursorCreatedAt ? and(statusCondition, lt(schema.modAppeals.createdAt, cursorCreatedAt)) : statusCondition;

    const rows = await db
      .select({ appeal: schema.modAppeals, user: schema.users, fullName: schema.profiles.fullName })
      .from(schema.modAppeals)
      .innerJoin(schema.users, eq(schema.users.id, schema.modAppeals.userId))
      .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.modAppeals.userId))
      .where(whereClause)
      .orderBy(desc(schema.modAppeals.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const pageRows = hasMore ? rows.slice(0, input.limit) : rows;

    const appeals: Appeal[] = pageRows.map((r) => ({
      id: r.appeal.id,
      userId: r.appeal.userId,
      userEmail: r.user.email,
      userFullName: r.fullName || "",
      userStatus: r.user.status as UserStatus,
      reason: r.appeal.reason,
      status: r.appeal.status as Appeal["status"],
      reviewerNotes: r.appeal.reviewerNotes,
      createdAt: r.appeal.createdAt.toISOString(),
      reviewedAt: r.appeal.reviewedAt ? r.appeal.reviewedAt.toISOString() : null,
    }));

    return { appeals, nextCursor: hasMore ? pageRows[pageRows.length - 1]?.appeal.id : undefined };
  }),

  resolveAppeal: protectedProcedure.input(resolveAppealInput).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.user.sub);

    const [appeal] = await db.select().from(schema.modAppeals).where(eq(schema.modAppeals.id, input.appealId)).limit(1);
    if (!appeal) throw new TRPCError({ code: "NOT_FOUND" });
    if (appeal.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "This appeal was already resolved." });

    if (input.decision === "approve") {
      await db
        .update(schema.modAppeals)
        .set({ status: "approved", reviewedBy: ctx.user.sub, reviewerNotes: input.notes, reviewedAt: new Date() })
        .where(eq(schema.modAppeals.id, input.appealId));
      await db
        .update(schema.users)
        .set({ status: "active", suspendedUntil: null, statusReason: null, statusChangedBy: ctx.user.sub, statusChangedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.users.id, appeal.userId));
      await logAction({ adminId: ctx.user.sub, targetUserId: appeal.userId, actionType: "appeal_approve", reason: input.notes });
      await notify(appeal.userId, "appeal_approved", { notes: input.notes });
    } else {
      await db
        .update(schema.modAppeals)
        .set({ status: "rejected", reviewedBy: ctx.user.sub, reviewerNotes: input.notes, reviewedAt: new Date() })
        .where(eq(schema.modAppeals.id, input.appealId));
      await logAction({ adminId: ctx.user.sub, targetUserId: appeal.userId, actionType: "appeal_reject", reason: input.notes });
      await notify(appeal.userId, "appeal_rejected", { notes: input.notes });
    }

    return { ok: true as const };
  }),

  // ────────────────────────────────────────────────────────
  // Integrity flags (platform-wide admin view)
  // ────────────────────────────────────────────────────────
  listIntegrityFlags: protectedProcedure.input(listIntegrityFlagsInput).query(async ({ ctx, input }) => {
    await requireAdmin(ctx.user.sub);

    let cursorCreatedAt: Date | undefined;
    if (input.cursor) {
      const [cursorRow] = await db.select({ createdAt: schema.integrityFlags.createdAt }).from(schema.integrityFlags).where(eq(schema.integrityFlags.id, input.cursor)).limit(1);
      cursorCreatedAt = cursorRow?.createdAt;
    }
    const resolutionCondition =
      input.resolution === "pending" ? isNull(schema.integrityFlags.resolution) : input.resolution ? eq(schema.integrityFlags.resolution, input.resolution) : undefined;
    const whereClause = cursorCreatedAt ? and(resolutionCondition, lt(schema.integrityFlags.createdAt, cursorCreatedAt)) : resolutionCondition;

    const rows = await db
      .select({ flag: schema.integrityFlags, fullName: schema.profiles.fullName })
      .from(schema.integrityFlags)
      .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.integrityFlags.userId))
      .where(whereClause)
      .orderBy(desc(schema.integrityFlags.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const pageRows = hasMore ? rows.slice(0, input.limit) : rows;

    const flags: ModIntegrityFlag[] = pageRows.map((r) => ({
      id: r.flag.id,
      sessionId: r.flag.sessionId,
      userId: r.flag.userId,
      userFullName: r.fullName || "",
      kind: r.flag.kind,
      severity: r.flag.severity as ModIntegrityFlag["severity"],
      detail: (r.flag.detail as Record<string, unknown>) ?? {},
      appealText: r.flag.appealText,
      resolution: (r.flag.resolution as ModIntegrityFlag["resolution"]) ?? null,
      createdAt: r.flag.createdAt.toISOString(),
    }));

    return { flags, nextCursor: hasMore ? pageRows[pageRows.length - 1]?.flag.id : undefined };
  }),

  resolveIntegrityFlag: protectedProcedure.input(resolveIntegrityFlagInput).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.user.sub);

    const [flag] = await db.select().from(schema.integrityFlags).where(eq(schema.integrityFlags.id, input.flagId)).limit(1);
    if (!flag) throw new TRPCError({ code: "NOT_FOUND" });

    await db
      .update(schema.integrityFlags)
      .set({ resolution: input.resolution, resolvedBy: ctx.user.sub, resolvedAt: new Date(), resolverNotes: input.notes })
      .where(eq(schema.integrityFlags.id, input.flagId));
    await logAction({ adminId: ctx.user.sub, targetUserId: flag.userId, actionType: "resolve_integrity_flag", reason: input.notes, detail: { flagId: input.flagId, resolution: input.resolution } });

    let autoSuspended = false;
    if (input.resolution === "upheld" && flag.severity === "critical") {
      const [countRow] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(schema.integrityFlags)
        .where(and(eq(schema.integrityFlags.userId, flag.userId), eq(schema.integrityFlags.severity, "critical"), eq(schema.integrityFlags.resolution, "upheld")));
      const violationCount = countRow?.count ?? 0;

      if (violationCount >= AUTO_SUSPEND_VIOLATION_THRESHOLD) {
        const [target] = await db.select().from(schema.users).where(eq(schema.users.id, flag.userId)).limit(1);
        if (target && target.status === "active") {
          const suspendedUntil = new Date(Date.now() + AUTO_SUSPEND_DURATION_DAYS * 24 * 60 * 60 * 1000);
          await db
            .update(schema.users)
            .set({ status: "suspended", suspendedUntil, statusReason: "Repeated integrity violations", statusChangedBy: ctx.user.sub, statusChangedAt: new Date(), updatedAt: new Date() })
            .where(eq(schema.users.id, flag.userId));
          await revokeAllRefreshTokensFor(flag.userId);
          await logAction({ adminId: ctx.user.sub, targetUserId: flag.userId, actionType: "suspend", reason: "Repeated integrity violations", detail: { auto: true, violationCount } });
          await notify(flag.userId, "user_suspended", { reason: "Repeated integrity violations", suspendedUntil: suspendedUntil.toISOString() });
          autoSuspended = true;
        }
      }
    }

    return { ok: true as const, autoSuspended };
  }),

  // ────────────────────────────────────────────────────────
  // Audit log
  // ────────────────────────────────────────────────────────
  listAuditLog: protectedProcedure.input(listAuditLogInput).query(async ({ ctx, input }) => {
    await requireAdmin(ctx.user.sub);

    let cursorCreatedAt: Date | undefined;
    if (input.cursor) {
      const [cursorRow] = await db.select({ createdAt: schema.moderationActions.createdAt }).from(schema.moderationActions).where(eq(schema.moderationActions.id, input.cursor)).limit(1);
      cursorCreatedAt = cursorRow?.createdAt;
    }

    const conditions = [];
    if (input.adminId) conditions.push(eq(schema.moderationActions.adminId, input.adminId));
    if (input.targetUserId) conditions.push(eq(schema.moderationActions.targetUserId, input.targetUserId));
    if (input.actionType) conditions.push(eq(schema.moderationActions.actionType, input.actionType));
    if (cursorCreatedAt) conditions.push(lt(schema.moderationActions.createdAt, cursorCreatedAt));
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select({ action: schema.moderationActions, adminName: schema.profiles.fullName })
      .from(schema.moderationActions)
      .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.moderationActions.adminId))
      .where(whereClause)
      .orderBy(desc(schema.moderationActions.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const pageRows = hasMore ? rows.slice(0, input.limit) : rows;

    return {
      actions: pageRows.map((r) => toAction(r.action, r.adminName || "")),
      nextCursor: hasMore ? pageRows[pageRows.length - 1]?.action.id : undefined,
    };
  }),
});
