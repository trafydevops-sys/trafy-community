import { z } from "zod";

export const applicationStatusSchema = z.enum([
  "applied",
  "screening",
  "assessment",
  "interview",
  "offer",
  "hired",
  "rejected",
]);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

// The order pipeline stages progress through — used by the UI to render a
// stage tracker and to guard against moving an application backwards.
export const APPLICATION_PIPELINE_ORDER: ApplicationStatus[] = [
  "applied",
  "screening",
  "assessment",
  "interview",
  "offer",
  "hired",
];

export const applyToJobInput = z.object({
  jobId: z.string().uuid(),
  coverNote: z.string().trim().max(3000).optional(),
});
export type ApplyToJobInput = z.infer<typeof applyToJobInput>;

export const updateApplicationStatusInput = z.object({
  applicationId: z.string().uuid(),
  status: applicationStatusSchema,
  rejectionReason: z.string().trim().min(1).max(2000).optional(),
}).refine(
  (d) => d.status !== "rejected" || (d.rejectionReason && d.rejectionReason.length > 0),
  { message: "A rejection reason is required when rejecting a candidate." }
);
export type UpdateApplicationStatusInput = z.infer<typeof updateApplicationStatusInput>;

export const bulkUpdateStatusInput = z.object({
  applicationIds: z.array(z.string().uuid()).min(1).max(50),
  status: applicationStatusSchema,
  rejectionReason: z.string().trim().min(1).max(2000).optional(),
}).refine(
  (d) => d.status !== "rejected" || (d.rejectionReason && d.rejectionReason.length > 0),
  { message: "A rejection reason is required when rejecting candidates." }
);

export const auditActionSchema = z.enum([
  "status_changed",
  "note_added",
  "tag_added",
  "tag_removed",
  "interview_scheduled",
  "assessment_sent",
  "rejection_reason_set",
]);

export const auditLogEntrySchema = z.object({
  id: z.string().uuid(),
  applicationId: z.string().uuid(),
  actorName: z.string(),
  action: auditActionSchema,
  fromValue: z.string().nullable().optional(),
  toValue: z.string().nullable().optional(),
  detail: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

export const exportPipelineInput = z.object({
  jobId: z.string().uuid(),
});

export const exportRowSchema = z.object({
  applicantName: z.string(),
  applicantEmail: z.string(),
  status: applicationStatusSchema,
  rejectionReason: z.string().optional(),
  coverNote: z.string().optional(),
  appliedAt: z.string(),
  screenedAt: z.string().optional(),
  assessmentSentAt: z.string().optional(),
  interviewedAt: z.string().optional(),
  offeredAt: z.string().optional(),
  hiredAt: z.string().optional(),
  rejectedAt: z.string().optional(),
  daysSinceApplied: z.number(),
});

export const applicationSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  jobTitle: z.string(),
  applicantId: z.string().uuid(),
  applicantName: z.string(),
  coverNote: z.string().optional(),
  status: applicationStatusSchema,
  rejectionReason: z.string().optional(),
  rejectedAt: z.string().optional(),
  stageTimestamps: z.object({
    screenedAt: z.string().optional(),
    assessmentSentAt: z.string().optional(),
    interviewedAt: z.string().optional(),
    offeredAt: z.string().optional(),
    hiredAt: z.string().optional(),
  }).optional(),
  hasContract: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Application = z.infer<typeof applicationSchema>;

export const listApplicationsForJobInput = z.object({ jobId: z.string().uuid() });
export type ListApplicationsForJobInput = z.infer<typeof listApplicationsForJobInput>;
