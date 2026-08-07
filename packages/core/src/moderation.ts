import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export const userStatusSchema = z.enum(["active", "suspended", "banned"]);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const reportStatusSchema = z.enum(["pending", "dismissed", "actioned"]);
export type ReportStatus = z.infer<typeof reportStatusSchema>;

export const appealStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type AppealStatus = z.infer<typeof appealStatusSchema>;

export const warningSeveritySchema = z.enum(["low", "medium", "high"]);
export type WarningSeverity = z.infer<typeof warningSeveritySchema>;

export const moderationActionTypeSchema = z.enum([
  "warn",
  "hide_post",
  "restore_post",
  "suspend",
  "unsuspend",
  "ban",
  "unban",
  "trust_score_adjust",
  "dismiss_report",
  "resolve_report",
  "appeal_approve",
  "appeal_reject",
  "resolve_integrity_flag",
]);
export type ModerationActionType = z.infer<typeof moderationActionTypeSchema>;

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const listReportsInput = z.object({
  status: reportStatusSchema.optional(), // omitted = all
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type ListReportsInput = z.infer<typeof listReportsInput>;

export const reportSummarySchema = z.object({
  id: z.string().uuid(),
  postId: z.string().uuid(),
  postBody: z.string(),
  postHiddenAt: z.string().nullable(),
  postAuthor: z.object({ id: z.string().uuid(), fullName: z.string() }),
  reporter: z.object({ id: z.string().uuid(), fullName: z.string() }),
  reason: z.string(),
  status: reportStatusSchema,
  reportCount: z.number().int().nonnegative(), // total reports against this post
  createdAt: z.string(),
});
export type ReportSummary = z.infer<typeof reportSummarySchema>;

export const listReportsOutput = z.object({
  reports: z.array(reportSummarySchema),
  nextCursor: z.string().uuid().optional(),
});
export type ListReportsOutput = z.infer<typeof listReportsOutput>;

export const getReportInput = z.object({ reportId: z.string().uuid() });
export type GetReportInput = z.infer<typeof getReportInput>;

export const resolveReportInput = z.object({
  reportId: z.string().uuid(),
  action: z.enum(["dismiss", "hide_post"]),
  note: z.string().trim().max(1000).optional(),
});
export type ResolveReportInput = z.infer<typeof resolveReportInput>;

export const hidePostInput = z.object({
  postId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});
export type HidePostInput = z.infer<typeof hidePostInput>;

export const restorePostInput = z.object({ postId: z.string().uuid() });
export type RestorePostInput = z.infer<typeof restorePostInput>;

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const listModUsersInput = z.object({
  query: z.string().trim().max(200).optional(), // matches email or full name
  status: userStatusSchema.optional(),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type ListModUsersInput = z.infer<typeof listModUsersInput>;

export const modUserSummarySchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  fullName: z.string(),
  status: userStatusSchema,
  trustScore: z.number().int(),
  suspendedUntil: z.string().nullable(),
  warningCount: z.number().int().nonnegative(),
  reportCount: z.number().int().nonnegative(), // reports filed against this user's posts
  createdAt: z.string(),
});
export type ModUserSummary = z.infer<typeof modUserSummarySchema>;

export const listModUsersOutput = z.object({
  users: z.array(modUserSummarySchema),
  nextCursor: z.string().uuid().optional(),
});
export type ListModUsersOutput = z.infer<typeof listModUsersOutput>;

export const getModUserInput = z.object({ userId: z.string().uuid() });
export type GetModUserInput = z.infer<typeof getModUserInput>;

export const moderationActionSchema = z.object({
  id: z.string().uuid(),
  adminId: z.string().uuid(),
  adminName: z.string(),
  targetUserId: z.string().uuid().nullable(),
  targetPostId: z.string().uuid().nullable(),
  actionType: moderationActionTypeSchema,
  reason: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type ModerationAction = z.infer<typeof moderationActionSchema>;

export const userWarningSchema = z.object({
  id: z.string().uuid(),
  reason: z.string(),
  severity: warningSeveritySchema,
  issuedBy: z.string().uuid(),
  issuedByName: z.string(),
  createdAt: z.string(),
});
export type UserWarning = z.infer<typeof userWarningSchema>;

export const modUserDetailSchema = modUserSummarySchema.extend({
  statusReason: z.string().nullable(),
  warnings: z.array(userWarningSchema),
  actions: z.array(moderationActionSchema), // actions taken against this user
  integrityViolationCount: z.number().int().nonnegative(), // upheld critical flags
});
export type ModUserDetail = z.infer<typeof modUserDetailSchema>;

export const warnUserInput = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
  severity: warningSeveritySchema.default("low"),
});
export type WarnUserInput = z.infer<typeof warnUserInput>;

export const suspendUserInput = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
  durationDays: z.number().int().min(1).max(365).default(7),
});
export type SuspendUserInput = z.infer<typeof suspendUserInput>;

export const unsuspendUserInput = z.object({ userId: z.string().uuid() });
export type UnsuspendUserInput = z.infer<typeof unsuspendUserInput>;

export const banUserInput = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
});
export type BanUserInput = z.infer<typeof banUserInput>;

export const unbanUserInput = z.object({ userId: z.string().uuid() });
export type UnbanUserInput = z.infer<typeof unbanUserInput>;

export const adjustTrustScoreInput = z.object({
  userId: z.string().uuid(),
  delta: z.number().int().min(-100).max(100),
  reason: z.string().trim().min(1).max(500),
});
export type AdjustTrustScoreInput = z.infer<typeof adjustTrustScoreInput>;

// ---------------------------------------------------------------------------
// Appeals
// ---------------------------------------------------------------------------

// Named distinctly from assessment.ts's submitAppealInput (integrity-flag
// appeal) — this one appeals a whole-account suspension/ban.
export const submitAccountAppealInput = z.object({
  reason: z.string().trim().min(1).max(2000),
});
export type SubmitAccountAppealInput = z.infer<typeof submitAccountAppealInput>;

export const appealSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  userEmail: z.string(),
  userFullName: z.string(),
  userStatus: userStatusSchema,
  reason: z.string(),
  status: appealStatusSchema,
  reviewerNotes: z.string().nullable(),
  createdAt: z.string(),
  reviewedAt: z.string().nullable(),
});
export type Appeal = z.infer<typeof appealSchema>;

export const listAppealsInput = z.object({
  status: appealStatusSchema.optional(),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type ListAppealsInput = z.infer<typeof listAppealsInput>;

export const listAppealsOutput = z.object({
  appeals: z.array(appealSchema),
  nextCursor: z.string().uuid().optional(),
});
export type ListAppealsOutput = z.infer<typeof listAppealsOutput>;

export const resolveAppealInput = z.object({
  appealId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  notes: z.string().trim().max(1000).optional(),
});
export type ResolveAppealInput = z.infer<typeof resolveAppealInput>;

// ---------------------------------------------------------------------------
// Integrity flags (admin-wide view; per-session view already lives in
// assessments.myFlags / listFlagsBySession)
// ---------------------------------------------------------------------------

export const listIntegrityFlagsInput = z.object({
  resolution: z.enum(["pending", "dismissed", "upheld"]).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type ListIntegrityFlagsInput = z.infer<typeof listIntegrityFlagsInput>;

export const modIntegrityFlagSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  userFullName: z.string(),
  kind: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  detail: z.record(z.string(), z.unknown()),
  appealText: z.string().nullable(),
  resolution: z.enum(["dismissed", "upheld", "pending"]).nullable(),
  createdAt: z.string(),
});
export type ModIntegrityFlag = z.infer<typeof modIntegrityFlagSchema>;

export const listIntegrityFlagsOutput = z.object({
  flags: z.array(modIntegrityFlagSchema),
  nextCursor: z.string().uuid().optional(),
});
export type ListIntegrityFlagsOutput = z.infer<typeof listIntegrityFlagsOutput>;

export const resolveIntegrityFlagInput = z.object({
  flagId: z.string().uuid(),
  resolution: z.enum(["dismissed", "upheld"]),
  notes: z.string().trim().max(1000).optional(),
});
export type ResolveIntegrityFlagInput = z.infer<typeof resolveIntegrityFlagInput>;

// Threshold at which upheld critical integrity flags trigger an automatic
// suspension (see moderation.resolveIntegrityFlag).
export const AUTO_SUSPEND_VIOLATION_THRESHOLD = 3;
export const AUTO_SUSPEND_DURATION_DAYS = 7;

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export const listAuditLogInput = z.object({
  adminId: z.string().uuid().optional(),
  targetUserId: z.string().uuid().optional(),
  actionType: moderationActionTypeSchema.optional(),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(30),
});
export type ListAuditLogInput = z.infer<typeof listAuditLogInput>;

export const listAuditLogOutput = z.object({
  actions: z.array(moderationActionSchema),
  nextCursor: z.string().uuid().optional(),
});
export type ListAuditLogOutput = z.infer<typeof listAuditLogOutput>;

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const dashboardStatsSchema = z.object({
  pendingReports: z.number().int().nonnegative(),
  suspendedUsers: z.number().int().nonnegative(),
  bannedUsers: z.number().int().nonnegative(),
  pendingAppeals: z.number().int().nonnegative(),
  unresolvedIntegrityFlags: z.number().int().nonnegative(),
  recentActions: z.array(moderationActionSchema),
});
export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

// ---------------------------------------------------------------------------
// Self-service: what a signed-in user sees about their own standing
// ---------------------------------------------------------------------------

export const myStandingSchema = z.object({
  status: userStatusSchema,
  statusReason: z.string().nullable(),
  suspendedUntil: z.string().nullable(),
  trustScore: z.number().int(),
  hasPendingAppeal: z.boolean(),
});
export type MyStanding = z.infer<typeof myStandingSchema>;
