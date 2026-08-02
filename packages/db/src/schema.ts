import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// One refresh token row per issued session. Rotated on every /auth/refresh
// call (old row revoked, new row inserted) so reuse of a stolen token is
// detectable — see docs/trafy-mobile-shared-backend.png "refresh-token rotation".
export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const profiles = pgTable(
  "profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull().default(""),
    bio: text("bio"),
    title: text("title"),
    // Arrays of EducationEntry / ExperienceEntry / Certificate from @trafy-community/core.
    education: jsonb("education").notNull().default([]),
    experience: jsonb("experience").notNull().default([]),
    certificates: jsonb("certificates").notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Discover's Postgres FTS: a GIN index over an on-the-fly tsvector of
    // name/title/bio, matched with plainto_tsquery in discover.search.
    index("profiles_search_idx").using(
      "gin",
      sql`to_tsvector('english', ${table.fullName} || ' ' || coalesce(${table.title}, '') || ' ' || coalesce(${table.bio}, ''))`
    ),
  ]
);

export const privacySettings = pgTable("privacy_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  profileVisibility: text("profile_visibility").notNull().default("public"),
  showEmail: boolean("show_email").notNull().default(false),
  showEducation: boolean("show_education").notNull().default(true),
  showExperience: boolean("show_experience").notNull().default(true),
  showCertificates: boolean("show_certificates").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Milestone 2 — Community shell: feed, follows, discover, chat, notifications
// ---------------------------------------------------------------------------

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("posts_created_at_idx").on(table.createdAt)]
);

export const postReactions = pgTable(
  "post_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("post_reactions_post_user_unique").on(table.postId, table.userId)]
);

export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followingId: uuid("following_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.followerId, table.followingId] })]
);

export const chatChannels = pgTable("chat_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(), // 'dm' | 'group'
  name: text("name"), // group display name; null for DMs
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatChannelMembers = pgTable(
  "chat_channel_members",
  {
    channelId: uuid("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.channelId, table.userId] })]
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("chat_messages_channel_created_idx").on(table.channelId, table.createdAt)]
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // NotificationType from @trafy-community/core
    payload: jsonb("payload").notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notifications_user_created_idx").on(table.userId, table.createdAt)]
);

// ---------------------------------------------------------------------------
// Milestone 6 — Institutions & Academy (placed here so Courses/Enrollments
// below can reference organizations/cohorts without a forward reference)
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("instructor"), // 'owner' | 'admin' | 'instructor'
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("org_members_unique").on(table.organizationId, table.userId),
    index("org_members_org_idx").on(table.organizationId),
    index("org_members_user_idx").on(table.userId),
  ]
);

// ---------------------------------------------------------------------------
// Milestone 3 — Learning Hub: courses, enrollment/progress, payments, payouts
// ---------------------------------------------------------------------------

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    pricingType: text("pricing_type").notNull().default("free"), // 'free' | 'paid' | 'live'
    priceCents: integer("price_cents").notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    published: boolean("published").notNull().default(false),
    // Optional — set when the course is published under an institution rather
    // than the creator's personal name.
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("courses_creator_idx").on(table.creatorId), index("courses_organization_idx").on(table.organizationId)]
);

export const courseModules = pgTable(
  "course_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    order: integer("order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("course_modules_course_idx").on(table.courseId)]
);

export const courseLessons = pgTable(
  "course_lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => courseModules.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    contentType: text("content_type").notNull(), // 'video' | 'text' | 'live'
    videoUrl: text("video_url"),
    textContent: text("text_content"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    // Sample lessons preview free even in a paid course, no enrollment required.
    isSample: boolean("is_sample").notNull().default(false),
    order: integer("order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("course_lessons_module_idx").on(table.moduleId)]
);

export const cohorts = pgTable(
  "cohorts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    capacity: integer("capacity"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("cohorts_course_idx").on(table.courseId)]
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Optional — set when the learner enrolled into a scheduled cohort rather
    // than self-paced.
    cohortId: uuid("cohort_id").references(() => cohorts.id, { onDelete: "set null" }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [unique("enrollments_course_user_unique").on(table.courseId, table.userId)]
);

export const courseReviews = pgTable(
  "course_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("course_reviews_course_user_unique").on(table.courseId, table.userId),
    index("course_reviews_course_idx").on(table.courseId),
  ]
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => courseLessons.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.lessonId] })]
);

export const payouts = pgTable("payouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  status: text("status").notNull().default("pending"), // 'pending' | 'paid'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    status: text("status").notNull(), // 'paid' | 'failed' | 'refunded'
    provider: text("provider").notNull().default("stub"), // 'stub' | 'razorpay' | 'stripe'
    providerRef: text("provider_ref"),
    payoutId: uuid("payout_id").references(() => payouts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("payments_course_idx").on(table.courseId)]
);

// ---------------------------------------------------------------------------
// Milestone 4 — Groups & assessments
// ---------------------------------------------------------------------------

// A discoverable study group backed by a group chat channel — membership IS
// channel membership (chatChannelMembers), so joining a group joins its chat.
export const studyGroups = pgTable(
  "study_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    topic: text("topic"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("study_groups_owner_idx").on(table.ownerId)]
);

export const questionBank = pgTable(
  "question_bank",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalId: varchar("external_id", { length: 120 }).unique(),
    track: text("track").notNull(), // Track from @trafy-community/core
    skillTags: jsonb("skill_tags").notNull().default([]), // string[]
    kind: text("kind").notNull(), // QuestionKind
    difficulty: integer("difficulty").notNull().default(1), // 1-5
    prompt: text("prompt").notNull(),
    payload: jsonb("payload").notNull(), // kind-specific, see @trafy-community/core; answer key stripped before serving
    active: boolean("active").notNull().default(true),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("question_bank_track_idx").on(table.track), index("question_bank_author_idx").on(table.authorId)]
);

// A persisted, reusable *definition* — specific question ids snapshotted from
// question_bank at assembly time, so later bank edits never change a test
// someone already took.
export const assessments = pgTable(
  "assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    track: text("track").notNull(),
    layer: integer("layer").notNull().default(1), // 1 | 2 — Layer 3/4 don't use this table
    timeLimitSeconds: integer("time_limit_seconds"),
    questionIds: jsonb("question_ids").notNull().default([]), // string[]
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }), // set for Layer 2 (JD-based) tests
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("assessments_author_idx").on(table.authorId), index("assessments_job_idx").on(table.jobId)]
);

export const assessmentSessions = pgTable(
  "assessment_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"), // 'active' | 'submitted' | 'graded' | 'expired'
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    telemetry: jsonb("telemetry").notNull().default({}), // { blur, paste, "fullscreen-exit": number }
  },
  (table) => [
    index("assessment_sessions_user_idx").on(table.userId),
    index("assessment_sessions_assessment_idx").on(table.assessmentId),
  ]
);

export const answers = pgTable(
  "answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => assessmentSessions.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questionBank.id),
    response: jsonb("response").notNull().default({}),
    correct: boolean("correct"),
    scoreFraction: real("score_fraction"), // 0-1, null until graded
    gradedAt: timestamp("graded_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("answers_session_question_unique").on(table.sessionId, table.questionId),
    index("answers_session_idx").on(table.sessionId),
  ]
);

// One row per graded session — the source of truth for Trafy Points.
export const trackResults = pgTable(
  "track_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => assessmentSessions.id, { onDelete: "cascade" }),
    track: text("track").notNull(),
    rawScore: real("raw_score").notNull(), // 0-1
    percentile: real("percentile").notNull(), // 0-100 vs cohort at grading time
    earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("track_results_session_unique").on(table.sessionId),
    index("track_results_user_idx").on(table.userId),
    index("track_results_track_idx").on(table.track),
  ]
);

// ---------------------------------------------------------------------------
// Milestone 5 — Hiring marketplace: jobs, applications, contracts + escrow
// ---------------------------------------------------------------------------

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    posterId: uuid("poster_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    jobType: text("job_type").notNull().default("full_time"), // 'full_time' | 'contract' | 'freelance'
    compensationType: text("compensation_type").notNull().default("salary"), // 'salary' | 'hourly' | 'fixed'
    compensationMinCents: integer("compensation_min_cents").notNull().default(0),
    compensationMaxCents: integer("compensation_max_cents"),
    currency: text("currency").notNull().default("usd"),
    location: text("location"),
    published: boolean("published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("jobs_poster_idx").on(table.posterId)]
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    applicantId: uuid("applicant_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    coverNote: text("cover_note"),
    status: text("status").notNull().default("applied"), // ApplicationStatus
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("applications_job_idx").on(table.jobId),
    index("applications_applicant_idx").on(table.applicantId),
    unique("applications_job_applicant_unique").on(table.jobId, table.applicantId),
  ]
);

export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    employerId: uuid("employer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    talentId: uuid("talent_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    currency: text("currency").notNull().default("usd"),
    status: text("status").notNull().default("active"), // 'active' | 'completed' | 'cancelled'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("contracts_application_unique").on(table.applicationId),
    index("contracts_employer_idx").on(table.employerId),
    index("contracts_talent_idx").on(table.talentId),
  ]
);

export const contractMilestones = pgTable(
  "contract_milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: text("status").notNull().default("pending"), // 'pending' | 'funded' | 'released'
    order: integer("order").notNull().default(0),
    fundedAt: timestamp("funded_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("contract_milestones_contract_idx").on(table.contractId)]
);

// ---------------------------------------------------------------------------
// Milestone 7 — Mobile shell: push token registration
// ---------------------------------------------------------------------------

// One row per device token. A token is unique regardless of user — if the
// same device re-registers under a different signed-in user, the row is
// reassigned rather than duplicated (see push.ts registerToken's upsert).
export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    platform: text("platform").notNull(), // 'ios' | 'android'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("push_tokens_user_idx").on(table.userId)]
);
