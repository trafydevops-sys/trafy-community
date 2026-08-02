# Assessment Foundation (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `trafy-community`'s pass/fail assessment system with the Trafy Points
model (cohort percentile + decay + rank-weighted composite) ported from the sibling
`trafy-platform` codebase, with real Judge0 code execution replacing the keyword-match
grading stub.

**Architecture:** New Postgres tables (`question_bank`, `assessments`, `assessment_sessions`,
`answers`, `track_results`) replace the old four assessment tables. MCQ/short-answer grade
synchronously; code answers enqueue a BullMQ job that a new worker process grades via the
Judge0 HTTP API, then finalizes the session (percentile via a pure scoring function ported
from `trafy-platform`). Socket.IO (already running) broadcasts grading and integrity events
live.

**Tech Stack:** Fastify + tRPC v10, Drizzle ORM (Postgres), ioredis, BullMQ (new), Judge0 CE
REST API, Socket.IO, Vitest (new to this repo).

## Global Constraints

- Schema columns follow this repo's existing convention: plain `text()` with a comment
  listing the union of allowed values, validated in Zod — never `pgEnum` (spec:
  `docs/superpowers/specs/2026-08-02-assessment-foundation-design.md`, Data model section).
- Trafy Points / percentile scale is 0–100 everywhere, no other scale exists (spec: "Score
  scale" section).
- The migration drops and recreates the assessment tables — this environment has only local
  dev data (spec: "Data note"). Do not add data-preservation logic.
- This repo has **zero existing test infrastructure** (no vitest/jest anywhere, 0 of 17
  routers have tests). Pure-function logic (scoring, Judge0 client, grading dispatch,
  session finalization) gets real Vitest unit tests, newly added in this plan. Router
  mutations that only orchestrate DB calls are verified manually against the local dev
  stack, matching this repo's existing convention — do not invent a DB-integration test
  harness that doesn't exist elsewhere in the codebase.
- `usingCodeGradingStub = !env.JUDGE0_URL` (`apps/api/src/lib/env.ts:39`) must keep working
  exactly as today: no `JUDGE0_URL` set → grading stays synchronous and stub-based, so local
  dev without Docker's Judge0 profile still works end-to-end.
- BullMQ's `Queue`/`Worker` require a Redis connection with `maxRetriesPerRequest: null` —
  the existing shared `redis` export in `apps/api/src/lib/redis.ts` is configured with
  `maxRetriesPerRequest: 3` for the OTP/rate-limit use case and **must not be reused
  directly** for BullMQ. Create a separate connection.

---

## Task 1: Trafy Points scoring engine + track taxonomy

**Files:**
- Modify: `packages/core/src/assessment.ts` (add track taxonomy + `TrackResult` type)
- Create: `packages/core/src/scoring.ts`
- Create: `packages/core/test/scoring.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json` (add `vitest` devDependency + `test` script)

**Interfaces:**
- Produces: `TRACKS: readonly string[]`, `Track` type, `trackSchema: ZodEnum`,
  `trackResultSchema`, `TrackResult = { track: Track; percentile: number; earnedAt: Date }`,
  `decayFactor(earnedAt: Date, now?: Date): number`,
  `decayedScore(result: TrackResult, now?: Date): number`,
  `computeTrafyPoints(results: TrackResult[], now?: Date): number`,
  `percentileOf(raw: number, cohort: number[]): number` — all consumed by later tasks.

- [ ] **Step 1: Add track taxonomy and `TrackResult` type**

Append to `packages/core/src/assessment.ts`:

```typescript
/** Skill tracks a talent can be assessed on. */
export const TRACKS = [
  "python",
  "ml-engineering",
  "llm-engineering",
  "data-engineering",
  "frontend",
  "backend",
  "devops",
] as const;
export type Track = (typeof TRACKS)[number];
export const trackSchema = z.enum(TRACKS);

/** A talent's percentile result on one track (0-100). */
export const trackResultSchema = z.object({
  track: trackSchema,
  percentile: z.number().min(0).max(100),
  earnedAt: z.coerce.date(),
});
export type TrackResult = z.infer<typeof trackResultSchema>;
```

- [ ] **Step 2: Add vitest to `packages/core`**

Modify `packages/core/package.json`:

```json
{
  "name": "@trafy-community/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^3.0.5"
  }
}
```

Run: `npm install` (from repo root, to pick up the new devDependency in the workspace)

- [ ] **Step 3: Write the failing scoring tests**

Create `packages/core/test/scoring.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { computeTrafyPoints, decayFactor, percentileOf } from "../src/scoring.js";
import type { TrackResult } from "../src/assessment.js";

const NOW = new Date("2026-08-01T00:00:00Z");

function result(track: TrackResult["track"], percentile: number, monthsAgo = 0): TrackResult {
  const earnedAt = new Date(NOW);
  earnedAt.setUTCDate(earnedAt.getUTCDate() - Math.round(monthsAgo * 30.44));
  return { track, percentile, earnedAt };
}

describe("decayFactor", () => {
  it("is 1 within 12 months", () => {
    expect(decayFactor(result("python", 90, 0).earnedAt, NOW)).toBe(1);
    expect(decayFactor(result("python", 90, 11.9).earnedAt, NOW)).toBe(1);
  });
  it("is 0 at or beyond 18 months", () => {
    expect(decayFactor(result("python", 90, 18.1).earnedAt, NOW)).toBe(0);
    expect(decayFactor(result("python", 90, 36).earnedAt, NOW)).toBe(0);
  });
  it("decays linearly between 12 and 18 months", () => {
    const f = decayFactor(result("python", 90, 15).earnedAt, NOW);
    expect(f).toBeGreaterThan(0.4);
    expect(f).toBeLessThan(0.6);
  });
});

describe("computeTrafyPoints", () => {
  it("returns 0 for no results", () => {
    expect(computeTrafyPoints([], NOW)).toBe(0);
  });
  it("equals the single percentile for one fresh track", () => {
    expect(computeTrafyPoints([result("python", 80)], NOW)).toBe(80);
  });
  it("rewards depth: strongest track dominates", () => {
    const pts = computeTrafyPoints([result("python", 90), result("frontend", 30)], NOW);
    // rank weights 1 and 1/2 -> (90 + 15) / 1.5 = 70
    expect(pts).toBe(70);
  });
  it("uses the best result per track, not duplicates", () => {
    const pts = computeTrafyPoints([result("python", 60), result("python", 90)], NOW);
    expect(pts).toBe(90);
  });
  it("stale results pull the score down via decay", () => {
    const fresh = computeTrafyPoints([result("python", 90, 1)], NOW);
    const stale = computeTrafyPoints([result("python", 90, 17)], NOW);
    expect(fresh).toBe(90);
    expect(stale).toBeLessThan(20);
  });
});

describe("percentileOf", () => {
  it("handles empty cohort with neutral 50", () => {
    expect(percentileOf(10, [])).toBe(50);
  });
  it("computes inclusive rank percentile", () => {
    expect(percentileOf(30, [10, 20, 30, 40])).toBe(62.5);
    expect(percentileOf(41, [10, 20, 30, 40])).toBe(100);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm run test -w packages/core`
Expected: FAIL — `Cannot find module '../src/scoring.js'` (file doesn't exist yet)

- [ ] **Step 5: Implement the scoring engine**

Create `packages/core/src/scoring.ts`:

```typescript
import type { TrackResult } from "./assessment.js";

/**
 * Trafy Points - the single 0-100 number recruiters see.
 *
 * Model:
 *  - each track result is a cohort percentile (0-100)
 *  - results decay linearly to 0 between DECAY_START_MONTHS and DECAY_END_MONTHS
 *  - the composite is a weighted mean that rewards depth over breadth:
 *    tracks are sorted by decayed score and weighted 1, 1/2, 1/3, ... so a
 *    talent's strongest skills dominate but extra tracks still help.
 */

export const DECAY_START_MONTHS = 12;
export const DECAY_END_MONTHS = 18;

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;

export function monthsBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / MS_PER_MONTH);
}

/** Multiplier in [0,1] applied to a result based on its age. */
export function decayFactor(earnedAt: Date, now: Date = new Date()): number {
  const age = monthsBetween(earnedAt, now);
  if (age <= DECAY_START_MONTHS) return 1;
  if (age >= DECAY_END_MONTHS) return 0;
  return 1 - (age - DECAY_START_MONTHS) / (DECAY_END_MONTHS - DECAY_START_MONTHS);
}

export function decayedScore(result: TrackResult, now: Date = new Date()): number {
  return result.percentile * decayFactor(result.earnedAt, now);
}

/** Composite Trafy Points across all of a talent's track results. */
export function computeTrafyPoints(results: TrackResult[], now: Date = new Date()): number {
  if (results.length === 0) return 0;
  const bestPerTrack = new Map<string, number>();
  for (const r of results) {
    const s = decayedScore(r, now);
    const prev = bestPerTrack.get(r.track);
    if (prev === undefined || s > prev) bestPerTrack.set(r.track, s);
  }
  const sorted = [...bestPerTrack.values()].sort((a, b) => b - a);
  let weighted = 0;
  let weightSum = 0;
  for (let i = 0; i < sorted.length; i++) {
    const w = 1 / (i + 1);
    weighted += (sorted[i] ?? 0) * w;
    weightSum += w;
  }
  return Math.round((weighted / weightSum) * 10) / 10;
}

/** Percentile of a raw score within a cohort of raw scores (inclusive rank). */
export function percentileOf(raw: number, cohort: number[]): number {
  if (cohort.length === 0) return 50;
  const below = cohort.filter((c) => c < raw).length;
  const equal = cohort.filter((c) => c === raw).length;
  return Math.round(((below + equal * 0.5) / cohort.length) * 1000) / 10;
}
```

- [ ] **Step 6: Export from the package root**

Modify `packages/core/src/index.ts` — add:

```typescript
export * from "./scoring.js";
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test -w packages/core`
Expected: PASS — all 11 tests green

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/scoring.ts packages/core/test/scoring.test.ts packages/core/src/assessment.ts packages/core/src/index.ts packages/core/package.json package-lock.json
git commit -m "feat(core): port Trafy Points scoring engine with track taxonomy"
```

---

## Task 2: New assessment/session Zod schemas

**Files:**
- Modify: `packages/core/src/assessment.ts` (replace the old create/addQuestion/attempt
  schemas with bank + assembly + session shapes)

**Interfaces:**
- Consumes: `Track`, `trackSchema` from Task 1.
- Produces: `bankQuestionKindSchema`, `BankQuestionKind`, `createBankQuestionInput`,
  `BankQuestionSummary` schema, `assembleAssessmentInput`, `AssessmentSummary`,
  `runnerQuestionSchema`/`RunnerQuestion` (single streamed question, no answer key),
  `answerResponseSchema`/`AnswerResponse`, `submitAnswerInput`, `submitAnswerResultSchema`
  (sync grade or `{ queued: true }`), `sessionResultSchema`/`SessionResult` (percentile +
  Trafy Points), `sessionHistoryItemSchema`. All consumed by Tasks 6, 7, 9, 10.

This task replaces the *entire* current contents of `packages/core/src/assessment.ts`
except the `TRACKS`/`Track`/`trackSchema`/`trackResultSchema`/`TrackResult` block added in
Task 1 (keep that block, replace everything else).

- [ ] **Step 1: Write the failing schema tests**

Create `packages/core/test/assessment-schemas.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  createBankQuestionInput,
  assembleAssessmentInput,
  answerResponseSchema,
  submitAnswerInput,
} from "../src/assessment.js";

describe("createBankQuestionInput", () => {
  it("accepts a valid single_choice question", () => {
    const parsed = createBankQuestionInput.parse({
      track: "backend",
      skillTags: ["rest-api"],
      kind: "single_choice",
      prompt: "What HTTP status means 'not found'?",
      difficulty: 2,
      options: ["200", "404", "500", "301"],
      correctIndex: 1,
    });
    expect(parsed.kind).toBe("single_choice");
  });

  it("accepts a valid code question with hidden test cases", () => {
    const parsed = createBankQuestionInput.parse({
      track: "python",
      skillTags: ["algorithms"],
      kind: "code",
      prompt: "Write a function that reverses a string.",
      difficulty: 1,
      language: "python",
      starterCode: "def reverse(s):\n    pass",
      hiddenTestCases: [{ input: "hello", expectedOutput: "olleh" }],
    });
    expect(parsed.kind).toBe("code");
  });

  it("rejects an unknown track", () => {
    const result = createBankQuestionInput.safeParse({
      track: "quantum-computing",
      skillTags: [],
      kind: "single_choice",
      prompt: "x",
      difficulty: 1,
      options: ["a", "b"],
      correctIndex: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("assembleAssessmentInput", () => {
  it("requires at least one question id", () => {
    const result = assembleAssessmentInput.safeParse({
      title: "Backend Screen",
      track: "backend",
      layer: 1,
      questionIds: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("answerResponseSchema", () => {
  it("accepts a code response", () => {
    const parsed = answerResponseSchema.parse({ source: "print('hi')" });
    expect(parsed.source).toBe("print('hi')");
  });
});

describe("submitAnswerInput", () => {
  it("requires sessionId, questionId and a response", () => {
    const parsed = submitAnswerInput.parse({
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      questionId: "550e8400-e29b-41d4-a716-446655440001",
      response: { selectedIndex: 1 },
    });
    expect(parsed.response.selectedIndex).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w packages/core`
Expected: FAIL — `createBankQuestionInput`/`assembleAssessmentInput`/etc. are not exported

- [ ] **Step 3: Replace the assessment schemas**

Replace the contents of `packages/core/src/assessment.ts` **below** the Task 1 track block
(keep `TRACKS`/`Track`/`trackSchema`/`trackResultSchema`/`TrackResult` exactly as added in
Task 1) with:

```typescript
export const bankQuestionKindSchema = z.enum(["single_choice", "multi_choice", "short_answer", "code"]);
export type BankQuestionKind = z.infer<typeof bankQuestionKindSchema>;

const hiddenTestCaseSchema = z.object({
  input: z.string().max(10000),
  expectedOutput: z.string().max(10000),
});
export type HiddenTestCase = z.infer<typeof hiddenTestCaseSchema>;

// One authoring input per kind (discriminated union) — mirrors the payload
// shapes stored in question_bank.payload. Answer keys / hidden test cases
// live here and are stripped before a question is streamed to a candidate.
export const createBankQuestionInput = z.discriminatedUnion("kind", [
  z.object({
    track: trackSchema,
    skillTags: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
    kind: z.literal("single_choice"),
    prompt: z.string().trim().min(1).max(4000),
    difficulty: z.number().int().min(1).max(5),
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(10),
    correctIndex: z.number().int().min(0),
  }),
  z.object({
    track: trackSchema,
    skillTags: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
    kind: z.literal("multi_choice"),
    prompt: z.string().trim().min(1).max(4000),
    difficulty: z.number().int().min(1).max(5),
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(10),
    correctIndices: z.array(z.number().int().min(0)).min(1),
  }),
  z.object({
    track: trackSchema,
    skillTags: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
    kind: z.literal("short_answer"),
    prompt: z.string().trim().min(1).max(4000),
    difficulty: z.number().int().min(1).max(5),
    acceptable: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  }),
  z.object({
    track: trackSchema,
    skillTags: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
    kind: z.literal("code"),
    prompt: z.string().trim().min(1).max(4000),
    difficulty: z.number().int().min(1).max(5),
    language: z.string().trim().max(40).default("python"),
    starterCode: z.string().max(10000).optional(),
    // Used by the Judge0 grading dispatcher when JUDGE0_URL is configured;
    // used as keyword-match rubric material by the stub grader otherwise.
    hiddenTestCases: z.array(hiddenTestCaseSchema).min(1).max(20),
  }),
]);
export type CreateBankQuestionInput = z.infer<typeof createBankQuestionInput>;

export const bankQuestionSummarySchema = z.object({
  id: z.string().uuid(),
  track: trackSchema,
  skillTags: z.array(z.string()),
  kind: bankQuestionKindSchema,
  prompt: z.string(),
  difficulty: z.number().int(),
  authorId: z.string().uuid(),
  createdAt: z.string(),
});
export type BankQuestionSummary = z.infer<typeof bankQuestionSummarySchema>;

// --- Assembly (an "assessments" row = a reusable, snapshotted definition) ---

export const assembleAssessmentInput = z.object({
  title: z.string().trim().min(1).max(200),
  track: trackSchema,
  layer: z.union([z.literal(1), z.literal(2)]),
  timeLimitSeconds: z.number().int().min(30).max(4 * 60 * 60).optional(),
  questionIds: z.array(z.string().uuid()).min(1).max(50),
  jobId: z.string().uuid().optional(),
});
export type AssembleAssessmentInput = z.infer<typeof assembleAssessmentInput>;

export const assessmentSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  track: trackSchema,
  layer: z.union([z.literal(1), z.literal(2)]),
  timeLimitSeconds: z.number().int().nullable(),
  questionCount: z.number().int().nonnegative(),
  authorId: z.string().uuid(),
  createdAt: z.string(),
});
export type AssessmentSummary = z.infer<typeof assessmentSummarySchema>;

// --- Runner (streamed one question at a time) ---

export const startSessionInput = z.object({ assessmentId: z.string().uuid() });
export type StartSessionInput = z.infer<typeof startSessionInput>;

// A question as served to a candidate — no answer key, no other questions.
export const runnerQuestionSchema = z.object({
  id: z.string().uuid(),
  kind: bankQuestionKindSchema,
  prompt: z.string(),
  options: z.array(z.string()).optional(),
  language: z.string().optional(),
  starterCode: z.string().optional(),
  questionNumber: z.number().int(),
  totalQuestions: z.number().int(),
});
export type RunnerQuestion = z.infer<typeof runnerQuestionSchema>;

export const startSessionResultSchema = z.object({
  sessionId: z.string().uuid(),
  title: z.string(),
  timeLimitSeconds: z.number().int().nullable(),
  expiresAt: z.string(),
  firstQuestion: runnerQuestionSchema,
});
export type StartSessionResult = z.infer<typeof startSessionResultSchema>;

export const answerResponseSchema = z.object({
  selectedIndex: z.number().int().optional(),
  selectedIndices: z.array(z.number().int()).optional(),
  text: z.string().max(20000).optional(),
  source: z.string().max(50000).optional(),
});
export type AnswerResponse = z.infer<typeof answerResponseSchema>;

export const submitAnswerInput = z.object({
  sessionId: z.string().uuid(),
  questionId: z.string().uuid(),
  response: answerResponseSchema,
});
export type SubmitAnswerInput = z.infer<typeof submitAnswerInput>;

// MCQ/short-answer grade synchronously and return the next question (or null
// if that was the last one). Code answers queue to Judge0 and return
// `graded: false` immediately — the client listens for `session:answer-graded`.
export const submitAnswerResultSchema = z.object({
  graded: z.boolean(),
  correct: z.boolean().nullable(),
  nextQuestion: runnerQuestionSchema.nullable(),
});
export type SubmitAnswerResult = z.infer<typeof submitAnswerResultSchema>;

export const recordTelemetryInput = z.object({
  sessionId: z.string().uuid(),
  event: z.enum(["tab_blur", "paste", "fullscreen_exit"]),
});
export type RecordTelemetryInput = z.infer<typeof recordTelemetryInput>;

export const submitSessionInput = z.object({ sessionId: z.string().uuid() });
export type SubmitSessionInput = z.infer<typeof submitSessionInput>;

export const sessionResultSchema = z.object({
  sessionId: z.string().uuid(),
  assessmentId: z.string().uuid(),
  title: z.string(),
  track: trackSchema,
  status: z.enum(["submitted", "graded"]),
  rawScore: z.number().nullable(),
  percentile: z.number().nullable(),
  submittedAt: z.string(),
});
export type SessionResult = z.infer<typeof sessionResultSchema>;

export const sessionHistoryItemSchema = z.object({
  sessionId: z.string().uuid(),
  assessmentId: z.string().uuid(),
  title: z.string(),
  track: trackSchema,
  percentile: z.number().nullable(),
  submittedAt: z.string(),
});
export type SessionHistoryItem = z.infer<typeof sessionHistoryItemSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w packages/core`
Expected: PASS — scoring tests still green, new schema tests green

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/assessment.ts packages/core/test/assessment-schemas.test.ts
git commit -m "feat(core): replace assessment schemas with question-bank/session model"
```

---

## Task 3: Question bank and session schema migration

**Files:**
- Modify: `packages/db/src/schema.ts` (remove old 4 tables, add 5 new tables)
- Create: migration via `drizzle-kit generate` (output path decided by the tool, under
  `packages/db/migrations/`)

**Interfaces:**
- Produces: `schema.questionBank`, `schema.assessments`, `schema.assessmentSessions`,
  `schema.answers`, `schema.trackResults` Drizzle tables, consumed by Tasks 6, 7, 9, 10.

- [ ] **Step 1: Remove the old assessment tables**

In `packages/db/src/schema.ts`, delete the `assessments`, `assessmentQuestions`,
`assessmentAttempts`, and `attemptAnswers` table definitions (the block starting at the
`// Milestone 4 — Groups & assessments` comment's `assessments` export through the
`attemptAnswers` export — keep the `studyGroups` export above it, which is unrelated).

- [ ] **Step 2: Add the new tables**

Insert in their place:

```typescript
export const questionBank = pgTable(
  "question_bank",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalId: text("external_id").unique(),
    track: text("track").notNull(), // Track from @trafy-community/core (TRACKS)
    skillTags: jsonb("skill_tags").notNull().default([]), // string[] — Layer 2 JD matching
    kind: text("kind").notNull(), // 'single_choice' | 'multi_choice' | 'short_answer' | 'code'
    difficulty: integer("difficulty").notNull().default(1), // 1-5
    prompt: text("prompt").notNull(),
    // Kind-specific: options+correctIndex, options+correctIndices, acceptable[],
    // or language+starterCode+hiddenTestCases for code. Stripped before serving
    // to a candidate — see runnerQuestionSchema.
    payload: jsonb("payload").notNull(),
    active: boolean("active").notNull().default(true),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("question_bank_track_idx").on(table.track),
    index("question_bank_author_idx").on(table.authorId),
  ]
);

export const assessments = pgTable(
  "assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    track: text("track").notNull(),
    layer: integer("layer").notNull().default(1), // 1 | 2 — Layer 3/4 don't use this table
    timeLimitSeconds: integer("time_limit_seconds"),
    // Snapshot of question_bank ids at assembly time — later bank edits never
    // change a test someone already took.
    questionIds: jsonb("question_ids").notNull(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
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
    // { tabBlurCount, pasteCount, fullscreenExitCount }
    telemetry: jsonb("telemetry").notNull().default({}),
  },
  (table) => [index("assessment_sessions_user_idx").on(table.userId)]
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
      .references(() => questionBank.id, { onDelete: "cascade" }),
    response: jsonb("response").notNull(),
    correct: boolean("correct"),
    scoreFraction: real("score_fraction"), // 0-1, partial credit for code
    gradedAt: timestamp("graded_at", { withTimezone: true }),
  },
  (table) => [unique("answers_session_question_unique").on(table.sessionId, table.questionId)]
);

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
  (table) => [index("track_results_user_idx").on(table.userId), index("track_results_track_idx").on(table.track)]
);
```

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate -w packages/db`
Expected: a new numbered SQL file appears under `packages/db/migrations/` containing `DROP
TABLE` statements for the old 4 tables and `CREATE TABLE` for the new 5. Read the generated
SQL to confirm it matches — drizzle-kit will prompt interactively if it can't tell a rename
from a drop+create; answer "create table" (not "rename") for each of the 5 new tables, since
these are genuinely new tables, not renames of the old ones.

- [ ] **Step 4: Apply the migration to local dev Postgres**

Run: `npm run infra:up` (if not already running), then `npm run db:migrate`
Expected: command exits 0, no errors

- [ ] **Step 5: Verify manually**

Run: `docker compose exec postgres psql -U trafy -d trafy_community -c "\dt"`
Expected: `question_bank`, `assessments`, `assessment_sessions`, `answers`, `track_results`
appear in the table list; `assessment_questions`, `assessment_attempts`, `attempt_answers`
do not.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations/
git commit -m "feat(db): replace assessment tables with question-bank/session/track-results model"
```

---

## Task 4: Judge0 HTTP client

**Files:**
- Create: `apps/api/src/lib/judge0.ts`
- Create: `apps/api/test/judge0.test.ts`
- Modify: `apps/api/package.json` (add `vitest` devDependency + `test` script)

**Interfaces:**
- Consumes: `HiddenTestCase` type from `@trafy-community/core` (Task 2).
- Produces: `runHiddenTestCases(judge0Url: string, language: string, source: string,
  testCases: HiddenTestCase[]): Promise<{ passed: number; total: number }>` — consumed by
  Task 5.

- [ ] **Step 1: Add vitest to `apps/api`**

Modify `apps/api/package.json` — add to `scripts`: `"test": "vitest run"`; add to
`devDependencies`: `"vitest": "^3.0.5"`.

Run: `npm install`

- [ ] **Step 2: Write the failing test**

Create `apps/api/test/judge0.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { runHiddenTestCases } from "../src/lib/judge0.js";

const JUDGE0_URL = "http://judge0.test";

describe("runHiddenTestCases", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submits one request per test case and counts accepted results", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      // submission 1: create
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "tok-1" }), { status: 201 }))
      // submission 1: poll (done immediately)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: { id: 3, description: "Accepted" }, stdout: "olleh\n" }), { status: 200 })
      )
      // submission 2: create
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "tok-2" }), { status: 201 }))
      // submission 2: poll (wrong answer)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: { id: 4, description: "Wrong Answer" }, stdout: "not olleh\n" }),
          { status: 200 }
        )
      );

    const result = await runHiddenTestCases(JUDGE0_URL, "python", "def reverse(s): ...", [
      { input: "hello", expectedOutput: "olleh" },
      { input: "world", expectedOutput: "dlrow" },
    ]);

    expect(result).toEqual({ passed: 1, total: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("treats an unknown language as a zero-pass result rather than throwing", async () => {
    const result = await runHiddenTestCases(JUDGE0_URL, "cobol", "IDENTIFICATION DIVISION.", [
      { input: "x", expectedOutput: "y" },
    ]);
    expect(result).toEqual({ passed: 0, total: 1 });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -w apps/api`
Expected: FAIL — `Cannot find module '../src/lib/judge0.js'`

- [ ] **Step 4: Implement the Judge0 client**

Create `apps/api/src/lib/judge0.ts`:

```typescript
import type { HiddenTestCase } from "@trafy-community/core";

// Judge0 CE language ids for the languages this platform's code questions
// currently support. Unknown languages fail closed (0 passed) rather than
// throwing, so a bad/unsupported language on a question never crashes grading.
const LANGUAGE_IDS: Record<string, number> = {
  python: 71,
  javascript: 63,
  typescript: 74,
};

const ACCEPTED_STATUS_ID = 3;
const POLL_INTERVAL_MS = 500;
const MAX_POLL_ATTEMPTS = 20;

type Judge0Result = {
  status: { id: number; description: string };
  stdout?: string | null;
  stderr?: string | null;
};

async function submitOne(judge0Url: string, languageId: number, source: string, testCase: HiddenTestCase): Promise<boolean> {
  const createResponse = await fetch(`${judge0Url}/submissions?base64_encoded=false&wait=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_code: source,
      language_id: languageId,
      stdin: testCase.input,
      expected_output: testCase.expectedOutput,
    }),
  });
  const { token } = (await createResponse.json()) as { token: string };

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const pollResponse = await fetch(`${judge0Url}/submissions/${token}?base64_encoded=false`);
    const result = (await pollResponse.json()) as Judge0Result;
    // status.id 1-2 = queued/processing; anything else is a terminal state.
    if (result.status.id > 2) {
      return result.status.id === ACCEPTED_STATUS_ID;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return false; // timed out — counts as failed, not thrown, so grading always finishes
}

/** Runs every hidden test case against Judge0 and returns how many passed. */
export async function runHiddenTestCases(
  judge0Url: string,
  language: string,
  source: string,
  testCases: HiddenTestCase[]
): Promise<{ passed: number; total: number }> {
  const languageId = LANGUAGE_IDS[language];
  if (languageId === undefined) {
    return { passed: 0, total: testCases.length };
  }

  let passed = 0;
  for (const testCase of testCases) {
    const ok = await submitOne(judge0Url, languageId, source, testCase);
    if (ok) passed += 1;
  }
  return { passed, total: testCases.length };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -w apps/api`
Expected: PASS — both tests green

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/judge0.ts apps/api/test/judge0.test.ts apps/api/package.json package-lock.json
git commit -m "feat(api): add Judge0 HTTP client for hidden-test-case grading"
```

---

## Task 5: Grading dispatcher (stub vs. real Judge0)

**Files:**
- Modify: `apps/api/src/lib/grading.ts`
- Create: `apps/api/test/grading.test.ts`

**Interfaces:**
- Consumes: `runHiddenTestCases` from Task 4; `BankQuestionKind`, `AnswerResponse` from
  `@trafy-community/core` (Task 2).
- Produces: `gradeSyncAnswer(kind, payload, response): number` (MCQ/short-answer, unchanged
  logic from today), `gradeCodeAnswer(judge0Url: string | undefined, payload, source):
  Promise<number>` — consumed by Task 7 (submitAnswer) and Task 7's worker wiring in Task 9.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/test/grading.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { gradeSyncAnswer, gradeCodeAnswer } from "../src/lib/grading.js";

describe("gradeSyncAnswer", () => {
  it("grades single_choice", () => {
    const fraction = gradeSyncAnswer("single_choice", { correctIndex: 1 }, { selectedIndex: 1 });
    expect(fraction).toBe(1);
  });
  it("grades multi_choice with penalty for wrong picks", () => {
    const fraction = gradeSyncAnswer(
      "multi_choice",
      { correctIndices: [0, 1] },
      { selectedIndices: [0, 2] }
    );
    expect(fraction).toBe(0.5); // 1 correct, 1 incorrect, out of 2 correct total
  });
  it("grades short_answer case-insensitively", () => {
    const fraction = gradeSyncAnswer("short_answer", { acceptable: ["paris"] }, { text: "Paris" });
    expect(fraction).toBe(1);
  });
});

describe("gradeCodeAnswer", () => {
  it("falls back to keyword matching when judge0Url is undefined", async () => {
    const fraction = await gradeCodeAnswer(
      undefined,
      { language: "python", hiddenTestCases: [], keywords: ["def", "return"] },
      "def reverse(s):\n    return s[::-1]"
    );
    expect(fraction).toBe(1);
  });

  it("uses Judge0 when judge0Url is provided", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "tok" }), { status: 201 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: { id: 3, description: "Accepted" } }), { status: 200 })
      );

    const fraction = await gradeCodeAnswer(
      "http://judge0.test",
      { language: "python", hiddenTestCases: [{ input: "a", expectedOutput: "a" }], keywords: [] },
      "def identity(x): return x"
    );
    expect(fraction).toBe(1);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w apps/api`
Expected: FAIL — `gradeSyncAnswer`/`gradeCodeAnswer` not exported yet

- [ ] **Step 3: Rewrite the grading module**

Replace the contents of `apps/api/src/lib/grading.ts`:

```typescript
import type { AnswerResponse, BankQuestionKind, HiddenTestCase } from "@trafy-community/core";
import { runHiddenTestCases } from "./judge0.js";

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === "number") : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Synchronous grading for single_choice / multi_choice / short_answer. Never throws. */
export function gradeSyncAnswer(
  kind: Exclude<BankQuestionKind, "code">,
  payload: Record<string, unknown>,
  response: AnswerResponse | undefined
): number {
  switch (kind) {
    case "single_choice": {
      const correctIndex = typeof payload.correctIndex === "number" ? payload.correctIndex : -1;
      return response?.selectedIndex === correctIndex ? 1 : 0;
    }
    case "multi_choice": {
      const correct = new Set(asNumberArray(payload.correctIndices));
      const selected = new Set(asNumberArray(response?.selectedIndices));
      if (correct.size === 0) return 0;
      let correctSelected = 0;
      let incorrectSelected = 0;
      for (const s of selected) {
        if (correct.has(s)) correctSelected += 1;
        else incorrectSelected += 1;
      }
      return Math.max(0, (correctSelected - incorrectSelected) / correct.size);
    }
    case "short_answer": {
      const acceptable = asStringArray(payload.acceptable).map(normalize);
      const answer = normalize(response?.text ?? "");
      return answer.length > 0 && acceptable.includes(answer) ? 1 : 0;
    }
  }
}

/**
 * Deterministic keyword-match fallback used when no JUDGE0_URL is configured:
 * fraction of the author's rubric keywords present (case-insensitive substring)
 * in the submitted source.
 */
function gradeCodeStub(keywords: string[], source: string): number {
  if (keywords.length === 0) return 0;
  const haystack = source.toLowerCase();
  const hits = keywords.filter((kw) => haystack.includes(kw.toLowerCase())).length;
  return hits / keywords.length;
}

type CodePayload = {
  language: string;
  hiddenTestCases: HiddenTestCase[];
  keywords: string[];
};

/**
 * Grades a code answer. With judge0Url set, runs the hidden test cases for
 * real; otherwise falls back to the keyword-match stub. Never throws — a
 * grading failure should never crash the caller, it should score 0.
 */
export async function gradeCodeAnswer(judge0Url: string | undefined, payload: CodePayload, source: string): Promise<number> {
  if (!judge0Url) {
    return gradeCodeStub(payload.keywords, source);
  }
  if (payload.hiddenTestCases.length === 0) {
    return gradeCodeStub(payload.keywords, source);
  }
  const { passed, total } = await runHiddenTestCases(judge0Url, payload.language, source, payload.hiddenTestCases);
  return total > 0 ? passed / total : 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w apps/api`
Expected: PASS — all grading + judge0 tests green

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/grading.ts apps/api/test/grading.test.ts
git commit -m "feat(api): rewrite grading as sync (MCQ) + async Judge0 (code) dispatcher"
```

---

## Task 6: Session finalization (pure logic)

**Files:**
- Create: `apps/api/src/lib/session-finalize.ts`
- Create: `apps/api/test/session-finalize.test.ts`

**Interfaces:**
- Consumes: `percentileOf` from `@trafy-community/core` (Task 1).
- Produces: `finalizeSession(input: { gradedFractions: number[]; cohortRawScores: number[] })
  => { rawScore: number; percentile: number }` — consumed by Task 9 (worker) and Task 7
  (synchronous-only sessions, e.g. an all-MCQ test that finalizes immediately on submit).

This isolates the "aggregate answers into a raw score, then percentile against a cohort"
logic as a pure function so it's unit-testable without a database — the worker and the
router both just fetch data and call this.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/session-finalize.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { finalizeSession } from "../src/lib/session-finalize.js";

describe("finalizeSession", () => {
  it("averages graded fractions into a raw score", () => {
    const result = finalizeSession({ gradedFractions: [1, 0.5, 0], cohortRawScores: [] });
    expect(result.rawScore).toBeCloseTo(0.5);
  });

  it("computes percentile against the cohort", () => {
    const result = finalizeSession({ gradedFractions: [0.8], cohortRawScores: [0.2, 0.4, 0.6, 0.8] });
    expect(result.percentile).toBe(87.5);
  });

  it("returns 0 raw score for an unanswered session rather than dividing by zero", () => {
    const result = finalizeSession({ gradedFractions: [], cohortRawScores: [] });
    expect(result.rawScore).toBe(0);
    expect(result.percentile).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/api`
Expected: FAIL — `Cannot find module '../src/lib/session-finalize.js'`

- [ ] **Step 3: Implement**

Create `apps/api/src/lib/session-finalize.ts`:

```typescript
import { percentileOf } from "@trafy-community/core";

export function finalizeSession(input: {
  gradedFractions: number[];
  cohortRawScores: number[];
}): { rawScore: number; percentile: number } {
  const rawScore =
    input.gradedFractions.length === 0
      ? 0
      : input.gradedFractions.reduce((sum, f) => sum + f, 0) / input.gradedFractions.length;
  const percentile = percentileOf(rawScore, input.cohortRawScores);
  return { rawScore: Math.round(rawScore * 1000) / 1000, percentile };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/api`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/session-finalize.ts apps/api/test/session-finalize.test.ts
git commit -m "feat(api): extract pure session-finalization (raw score + percentile) logic"
```

---

## Task 7: BullMQ queue + worker entrypoint

**Files:**
- Modify: `apps/api/package.json` (add `bullmq` dependency, `worker` script)
- Modify: root `package.json` (add `dev:worker` script)
- Create: `apps/api/src/lib/queue.ts`
- Create: `apps/api/src/worker.ts`

**Interfaces:**
- Consumes: `gradeCodeAnswer` (Task 5), `finalizeSession` (Task 6), `schema.answers`,
  `schema.assessmentSessions`, `schema.trackResults`, `schema.questionBank` (Task 3).
- Produces: `codeGradingQueue: Queue`, `enqueueCodeGrading(job: { answerId: string }):
  Promise<void>` — consumed by Task 9's `submitAnswer` mutation.

No unit test here — this task wires I/O (Redis, Postgres, Judge0) that Tasks 4-6 already
cover with real unit tests. Verified manually per Global Constraints.

- [ ] **Step 1: Add the BullMQ dependency**

Modify `apps/api/package.json` — add to `dependencies`: `"bullmq": "^5.34.0"`; add to
`scripts`: `"worker": "tsx watch src/worker.ts"`.

Run: `npm install`

- [ ] **Step 2: Create the queue**

Create `apps/api/src/lib/queue.ts`:

```typescript
import { Queue } from "bullmq";
import { env } from "./env.js";

// BullMQ requires its own connection with maxRetriesPerRequest: null (it
// issues blocking commands) — do NOT reuse the shared `redis` export from
// ./redis.js, which is configured with maxRetriesPerRequest: 3 for the
// OTP/rate-limit use case and is incompatible with BullMQ's requirements.
const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null as const };

export const codeGradingQueue = new Queue("code-grading", { connection });

export async function enqueueCodeGrading(job: { answerId: string }): Promise<void> {
  await codeGradingQueue.add("grade", job, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });
}
```

- [ ] **Step 3: Create the worker**

Create `apps/api/src/worker.ts`:

```typescript
import { Worker } from "bullmq";
import { eq, and, isNull } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import { db } from "./lib/db.js";
import { env, usingCodeGradingStub } from "./lib/env.js";
import { gradeCodeAnswer } from "./lib/grading.js";
import { finalizeSession } from "./lib/session-finalize.js";
import { emitSessionAnswerGraded, emitSessionGraded } from "./lib/realtime.js";

const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null as const };

async function finalizeIfComplete(sessionId: string): Promise<void> {
  const pending = await db
    .select({ id: schema.answers.id })
    .from(schema.answers)
    .where(and(eq(schema.answers.sessionId, sessionId), isNull(schema.answers.gradedAt)));
  if (pending.length > 0) return;

  const [session] = await db
    .select()
    .from(schema.assessmentSessions)
    .where(eq(schema.assessmentSessions.id, sessionId))
    .limit(1);
  if (!session) return;

  const [assessment] = await db
    .select()
    .from(schema.assessments)
    .where(eq(schema.assessments.id, session.assessmentId))
    .limit(1);
  if (!assessment) return;

  const answerRows = await db.select().from(schema.answers).where(eq(schema.answers.sessionId, sessionId));
  const cohort = await db
    .select({ rawScore: schema.trackResults.rawScore })
    .from(schema.trackResults)
    .where(eq(schema.trackResults.track, assessment.track));

  const { rawScore, percentile } = finalizeSession({
    gradedFractions: answerRows.map((a) => a.scoreFraction ?? 0),
    cohortRawScores: cohort.map((c) => c.rawScore),
  });

  await db.insert(schema.trackResults).values({
    userId: session.userId,
    sessionId: session.id,
    track: assessment.track,
    rawScore,
    percentile,
  });
  await db
    .update(schema.assessmentSessions)
    .set({ status: "graded" })
    .where(eq(schema.assessmentSessions.id, sessionId));

  emitSessionGraded(session.userId, { sessionId, rawScore, percentile });
}

export const worker = new Worker(
  "code-grading",
  async (job) => {
    const { answerId } = job.data as { answerId: string };

    const [answer] = await db.select().from(schema.answers).where(eq(schema.answers.id, answerId)).limit(1);
    if (!answer) return;

    const [question] = await db
      .select()
      .from(schema.questionBank)
      .where(eq(schema.questionBank.id, answer.questionId))
      .limit(1);
    if (!question) return;

    const payload = question.payload as { language: string; hiddenTestCases: unknown[]; keywords?: string[] };
    const response = answer.response as { source?: string };
    const fraction = await gradeCodeAnswer(
      usingCodeGradingStub ? undefined : env.JUDGE0_URL,
      {
        language: payload.language,
        hiddenTestCases: payload.hiddenTestCases as never,
        keywords: payload.keywords ?? [],
      },
      response.source ?? ""
    );

    await db
      .update(schema.answers)
      .set({ scoreFraction: fraction, correct: fraction === 1, gradedAt: new Date() })
      .where(eq(schema.answers.id, answerId));

    const [session] = await db
      .select()
      .from(schema.assessmentSessions)
      .where(eq(schema.assessmentSessions.id, answer.sessionId))
      .limit(1);
    if (session) {
      emitSessionAnswerGraded(session.userId, { sessionId: session.id, questionId: answer.questionId, correct: fraction === 1 });
      await finalizeIfComplete(session.id);
    }
  },
  { connection }
);

worker.on("failed", (job, err) => {
  console.error(`[worker] code-grading job ${job?.id} failed:`, err.message);
});

console.log("[worker] code-grading worker started");
```

- [ ] **Step 4: Add the root dev:worker script**

Modify root `package.json` — add to `scripts`: `"dev:worker": "npm run worker -w apps/api"`.

- [ ] **Step 5: Verify manually**

Run: `npm run infra:up` then `npm run dev:worker` in one terminal.
Expected: console prints `[worker] code-grading worker started` with no errors (this
confirms the Redis connection and DB imports resolve correctly — full end-to-end grading is
verified in Task 9 once `submitAnswer` can actually enqueue a job).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/queue.ts apps/api/src/worker.ts apps/api/package.json package.json package-lock.json
git commit -m "feat(api): add BullMQ code-grading queue and worker process"
```

---

## Task 8: Real-time events for grading and integrity

**Files:**
- Modify: `apps/api/src/lib/realtime.ts`

**Interfaces:**
- Consumes: existing `io` instance and `user:{userId}` room convention already in the file.
- Produces: `emitSessionAnswerGraded(userId, payload)`, `emitSessionGraded(userId,
  payload)`, `emitIntegrityFlag(assessmentId, payload)` — consumed by Task 7 (worker) and
  Task 9 (router).

- [ ] **Step 1: Add the new emit functions**

Modify `apps/api/src/lib/realtime.ts` — append after the existing `emitNotification`:

```typescript
export function emitSessionAnswerGraded(
  userId: string,
  payload: { sessionId: string; questionId: string; correct: boolean }
): void {
  io?.to(`user:${userId}`).emit("session:answer-graded", payload);
}

export function emitSessionGraded(
  userId: string,
  payload: { sessionId: string; rawScore: number; percentile: number }
): void {
  io?.to(`user:${userId}`).emit("session:graded", payload);
}

/** Threshold to avoid flooding a recruiter's live view on ordinary blur/paste noise. */
const INTEGRITY_FLAG_THRESHOLD = 3;

export function emitIntegrityFlag(
  assessmentId: string,
  payload: { sessionId: string; event: "tab_blur" | "paste" | "fullscreen_exit"; count: number }
): void {
  if (payload.count < INTEGRITY_FLAG_THRESHOLD) return;
  io?.to(`assessment:${assessmentId}:live`).emit("integrity:flag", payload);
}
```

Every candidate already joins `user:{userId}` on connection (existing code, line 30) — no
new room-join logic needed for grading events. A recruiter/proctor joining
`assessment:{assessmentId}:live` is part of the recruiter console, a later spec; the emit
function is ready for it now.

- [ ] **Step 2: Verify manually**

Run: `npm run typecheck -w apps/api`
Expected: exits 0 (confirms the new exports compile cleanly against Task 7's imports of
them)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/realtime.ts
git commit -m "feat(api): add session-graded and integrity-flag realtime events"
```

---

## Task 9: Assessments router — bank authoring and assembly

**Files:**
- Modify: `apps/api/src/routers/assessments.ts` (full rewrite)

**Interfaces:**
- Consumes: all schemas from Task 2, `schema.questionBank`/`schema.assessments` from Task
  3.
- Produces: `assessmentsRouter.bank.create`, `.bank.list`, `.create` — consumed by Task 10
  (same router file) and, later, by the Layer 2 spec's JD-assembly flow.

This task and Task 10 both edit `apps/api/src/routers/assessments.ts`; do Task 9 first and
leave the file in a compiling state (Task 10 adds the runner procedures below it).

- [ ] **Step 1: Replace the router's authoring/catalog section**

Replace the full contents of `apps/api/src/routers/assessments.ts` with (runner procedures
added in Task 10 — this version compiles and is fully usable for bank authoring + assembly
on its own):

```typescript
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import {
  createBankQuestionInput,
  assembleAssessmentInput,
  type BankQuestionSummary,
  type AssessmentSummary,
} from "@trafy-community/core";
import { z } from "zod";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";

function toBankSummary(row: typeof schema.questionBank.$inferSelect): BankQuestionSummary {
  return {
    id: row.id,
    track: row.track as BankQuestionSummary["track"],
    skillTags: row.skillTags as string[],
    kind: row.kind as BankQuestionSummary["kind"],
    prompt: row.prompt,
    difficulty: row.difficulty,
    authorId: row.authorId,
    createdAt: row.createdAt.toISOString(),
  };
}

async function toAssessmentSummary(row: typeof schema.assessments.$inferSelect): Promise<AssessmentSummary> {
  const questionIds = row.questionIds as string[];
  return {
    id: row.id,
    title: row.title,
    track: row.track as AssessmentSummary["track"],
    layer: row.layer as AssessmentSummary["layer"],
    timeLimitSeconds: row.timeLimitSeconds,
    questionCount: questionIds.length,
    authorId: row.authorId,
    createdAt: row.createdAt.toISOString(),
  };
}

export const assessmentsRouter = router({
  bank: router({
    create: protectedProcedure.input(createBankQuestionInput).mutation(async ({ ctx, input }) => {
      const { track, skillTags, kind, prompt, difficulty, ...rest } = input;
      const [row] = await db
        .insert(schema.questionBank)
        .values({
          track,
          skillTags,
          kind,
          prompt,
          difficulty,
          payload: rest,
          authorId: ctx.user.sub,
        })
        .returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toBankSummary(row);
    }),

    list: protectedProcedure
      .input(z.object({ track: z.string().optional(), skillTag: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const rows = await db.select().from(schema.questionBank).where(eq(schema.questionBank.active, true));
        const filtered = rows.filter((r) => {
          if (input?.track && r.track !== input.track) return false;
          if (input?.skillTag && !(r.skillTags as string[]).includes(input.skillTag)) return false;
          return true;
        });
        return filtered.map(toBankSummary);
      }),
  }),

  create: protectedProcedure.input(assembleAssessmentInput).mutation(async ({ ctx, input }) => {
    const [row] = await db
      .insert(schema.assessments)
      .values({
        title: input.title,
        track: input.track,
        layer: input.layer,
        timeLimitSeconds: input.timeLimitSeconds,
        questionIds: input.questionIds,
        jobId: input.jobId,
        authorId: ctx.user.sub,
      })
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return toAssessmentSummary(row);
  }),

  listMine: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select().from(schema.assessments).where(eq(schema.assessments.authorId, ctx.user.sub));
    return Promise.all(rows.map(toAssessmentSummary));
  }),
});
```

- [ ] **Step 2: Verify manually**

Run: `npm run typecheck -w apps/api`
Expected: exits 0

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routers/assessments.ts
git commit -m "feat(api): rewrite assessments router — bank authoring and assembly"
```

---

## Task 10: Assessments router — session runner

**Files:**
- Modify: `apps/api/src/routers/assessments.ts` (add runner procedures to the router built
  in Task 9)

**Interfaces:**
- Consumes: `startSessionInput`, `runnerQuestionSchema`, `submitAnswerInput`,
  `recordTelemetryInput`, `submitSessionInput`, `sessionResultSchema`,
  `sessionHistoryItemSchema` (Task 2); `gradeSyncAnswer` (Task 5); `enqueueCodeGrading`
  (Task 7); `finalizeSession` (Task 6); `emitIntegrityFlag` (Task 8).

- [ ] **Step 1: Add the runner procedures**

Modify `apps/api/src/routers/assessments.ts`:

1. Add to the import block:

```typescript
import {
  createBankQuestionInput,
  assembleAssessmentInput,
  startSessionInput,
  submitAnswerInput,
  recordTelemetryInput,
  submitSessionInput,
  type BankQuestionSummary,
  type AssessmentSummary,
  type RunnerQuestion,
} from "@trafy-community/core";
import { and, asc, eq, isNull } from "drizzle-orm";
import { gradeSyncAnswer, gradeCodeAnswer } from "../lib/grading.js";
import { enqueueCodeGrading } from "../lib/queue.js";
import { finalizeSession } from "../lib/session-finalize.js";
import { emitIntegrityFlag } from "../lib/realtime.js";
import { env, usingCodeGradingStub } from "../lib/env.js";
```

(replace the existing `import { eq } from "drizzle-orm";` line with the `and, asc, eq,
isNull` version above, and replace the existing `@trafy-community/core` import block with
this expanded one)

2. Add a helper above `export const assessmentsRouter`:

```typescript
function toRunnerQuestion(row: typeof schema.questionBank.$inferSelect, index: number, total: number): RunnerQuestion {
  const payload = row.payload as { options?: string[]; language?: string; starterCode?: string };
  return {
    id: row.id,
    kind: row.kind as RunnerQuestion["kind"],
    prompt: row.prompt,
    options: payload.options,
    language: payload.language,
    starterCode: payload.starterCode,
    questionNumber: index + 1,
    totalQuestions: total,
  };
}
```

3. Add these procedures inside `assessmentsRouter` (after `listMine`, before the closing
   `});`):

```typescript
  startSession: protectedProcedure.input(startSessionInput).mutation(async ({ ctx, input }) => {
    const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, input.assessmentId)).limit(1);
    if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });

    const questionIds = assessment.questionIds as string[];
    if (questionIds.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "This assessment has no questions." });

    const expiresAt = new Date(Date.now() + (assessment.timeLimitSeconds ?? 3600) * 1000);
    const [session] = await db
      .insert(schema.assessmentSessions)
      .values({ assessmentId: assessment.id, userId: ctx.user.sub, expiresAt })
      .returning();
    if (!session) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [firstQuestionRow] = await db.select().from(schema.questionBank).where(eq(schema.questionBank.id, questionIds[0]!)).limit(1);
    if (!firstQuestionRow) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    return {
      sessionId: session.id,
      title: assessment.title,
      timeLimitSeconds: assessment.timeLimitSeconds,
      expiresAt: expiresAt.toISOString(),
      firstQuestion: toRunnerQuestion(firstQuestionRow, 0, questionIds.length),
    };
  }),

  recordTelemetry: protectedProcedure.input(recordTelemetryInput).mutation(async ({ input }) => {
    const [session] = await db.select().from(schema.assessmentSessions).where(eq(schema.assessmentSessions.id, input.sessionId)).limit(1);
    if (!session) throw new TRPCError({ code: "NOT_FOUND" });

    const telemetry = session.telemetry as { tabBlurCount?: number; pasteCount?: number; fullscreenExitCount?: number };
    const key = input.event === "tab_blur" ? "tabBlurCount" : input.event === "paste" ? "pasteCount" : "fullscreenExitCount";
    const nextCount = (telemetry[key] ?? 0) + 1;
    const nextTelemetry = { ...telemetry, [key]: nextCount };

    await db.update(schema.assessmentSessions).set({ telemetry: nextTelemetry }).where(eq(schema.assessmentSessions.id, session.id));
    emitIntegrityFlag(session.assessmentId, { sessionId: session.id, event: input.event, count: nextCount });
    return { ok: true as const };
  }),

  submitAnswer: protectedProcedure.input(submitAnswerInput).mutation(async ({ ctx, input }) => {
    const [session] = await db.select().from(schema.assessmentSessions).where(eq(schema.assessmentSessions.id, input.sessionId)).limit(1);
    if (!session || session.userId !== ctx.user.sub) throw new TRPCError({ code: "NOT_FOUND" });

    const [question] = await db.select().from(schema.questionBank).where(eq(schema.questionBank.id, input.questionId)).limit(1);
    if (!question) throw new TRPCError({ code: "NOT_FOUND" });

    const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, session.assessmentId)).limit(1);
    if (!assessment) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const questionIds = assessment.questionIds as string[];
    const currentIndex = questionIds.indexOf(input.questionId);
    const nextId = questionIds[currentIndex + 1];

    if (question.kind === "code") {
      const [answerRow] = await db
        .insert(schema.answers)
        .values({ sessionId: session.id, questionId: question.id, response: input.response })
        .onConflictDoUpdate({
          target: [schema.answers.sessionId, schema.answers.questionId],
          set: { response: input.response, gradedAt: null, scoreFraction: null, correct: null },
        })
        .returning();
      if (!answerRow) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (usingCodeGradingStub) {
        // Stub grades synchronously — no Judge0 configured, no queue needed.
        const payload = question.payload as { language: string; hiddenTestCases: never[]; keywords?: string[] };
        const fraction = await gradeCodeAnswer(undefined, { ...payload, keywords: payload.keywords ?? [] }, input.response.source ?? "");
        await db
          .update(schema.answers)
          .set({ scoreFraction: fraction, correct: fraction === 1, gradedAt: new Date() })
          .where(eq(schema.answers.id, answerRow.id));
      } else {
        await enqueueCodeGrading({ answerId: answerRow.id });
      }

      const nextQuestionRow = nextId
        ? (await db.select().from(schema.questionBank).where(eq(schema.questionBank.id, nextId)).limit(1))[0]
        : undefined;
      return {
        graded: usingCodeGradingStub,
        correct: null,
        nextQuestion: nextQuestionRow ? toRunnerQuestion(nextQuestionRow, currentIndex + 1, questionIds.length) : null,
      };
    }

    const fraction = gradeSyncAnswer(question.kind as "single_choice" | "multi_choice" | "short_answer", question.payload as Record<string, unknown>, input.response);
    await db
      .insert(schema.answers)
      .values({ sessionId: session.id, questionId: question.id, response: input.response, scoreFraction: fraction, correct: fraction === 1, gradedAt: new Date() })
      .onConflictDoUpdate({
        target: [schema.answers.sessionId, schema.answers.questionId],
        set: { response: input.response, scoreFraction: fraction, correct: fraction === 1, gradedAt: new Date() },
      });

    const nextQuestionRow = nextId
      ? (await db.select().from(schema.questionBank).where(eq(schema.questionBank.id, nextId)).limit(1))[0]
      : undefined;
    return {
      graded: true,
      correct: fraction === 1,
      nextQuestion: nextQuestionRow ? toRunnerQuestion(nextQuestionRow, currentIndex + 1, questionIds.length) : null,
    };
  }),

  submitSession: protectedProcedure.input(submitSessionInput).mutation(async ({ ctx, input }) => {
    const [session] = await db.select().from(schema.assessmentSessions).where(eq(schema.assessmentSessions.id, input.sessionId)).limit(1);
    if (!session || session.userId !== ctx.user.sub) throw new TRPCError({ code: "NOT_FOUND" });
    if (session.submittedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "This session was already submitted." });

    const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, session.assessmentId)).limit(1);
    if (!assessment) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    await db.update(schema.assessmentSessions).set({ submittedAt: new Date(), status: "submitted" }).where(eq(schema.assessmentSessions.id, session.id));

    const pending = await db
      .select({ id: schema.answers.id })
      .from(schema.answers)
      .where(and(eq(schema.answers.sessionId, session.id), isNull(schema.answers.gradedAt)));

    if (pending.length > 0) {
      // Code answers still grading in the background — client listens for
      // session:graded via realtime; this response reflects "submitted", not
      // yet "graded".
      return { sessionId: session.id, assessmentId: assessment.id, title: assessment.title, track: assessment.track, status: "submitted" as const, rawScore: null, percentile: null, submittedAt: new Date().toISOString() };
    }

    const answerRows = await db.select().from(schema.answers).where(eq(schema.answers.sessionId, session.id));
    const cohort = await db.select({ rawScore: schema.trackResults.rawScore }).from(schema.trackResults).where(eq(schema.trackResults.track, assessment.track));
    const { rawScore, percentile } = finalizeSession({
      gradedFractions: answerRows.map((a) => a.scoreFraction ?? 0),
      cohortRawScores: cohort.map((c) => c.rawScore),
    });

    await db.insert(schema.trackResults).values({ userId: session.userId, sessionId: session.id, track: assessment.track, rawScore, percentile });
    await db.update(schema.assessmentSessions).set({ status: "graded" }).where(eq(schema.assessmentSessions.id, session.id));

    return { sessionId: session.id, assessmentId: assessment.id, title: assessment.title, track: assessment.track, status: "graded" as const, rawScore, percentile, submittedAt: new Date().toISOString() };
  }),

  myHistory: protectedProcedure.query(async ({ ctx }) => {
    const results = await db.select().from(schema.trackResults).where(eq(schema.trackResults.userId, ctx.user.sub));
    return Promise.all(
      results.map(async (r) => {
        const [session] = await db.select().from(schema.assessmentSessions).where(eq(schema.assessmentSessions.id, r.sessionId)).limit(1);
        const [assessment] = session ? await db.select().from(schema.assessments).where(eq(schema.assessments.id, session.assessmentId)).limit(1) : [undefined];
        return {
          sessionId: r.sessionId,
          assessmentId: assessment?.id ?? "",
          title: assessment?.title ?? "",
          track: r.track as AssessmentSummary["track"],
          percentile: r.percentile,
          submittedAt: r.earnedAt.toISOString(),
        };
      })
    );
  }),
```

- [ ] **Step 2: Verify manually — full happy path**

Run: `npm run infra:up`, `npm run dev:api`, `npm run dev:worker` in separate terminals (no
`JUDGE0_URL` set, so grading stays synchronous via the stub — this exercises every code path
except the actual BullMQ queue traversal, which Task 7 already confirmed starts cleanly).

Using a tRPC client or `curl` against `http://localhost:4000/trpc`:
1. Sign in (existing `auth.requestOtp`/`auth.verifyOtp` flow) to get an access token.
2. `assessments.bank.create` with a `single_choice` question on track `backend`.
3. `assessments.bank.create` with a `code` question on track `backend`, `hiddenTestCases: [{
   input: "", expectedOutput: "" }]`, `keywords: ["return"]`.
4. `assessments.create` with `questionIds` = both ids from steps 2-3, `track: "backend"`,
   `layer: 1`.
5. `assessments.startSession` with that assessment id — expect `firstQuestion` to be the
   `single_choice` question.
6. `assessments.submitAnswer` for it — expect `graded: true`, `nextQuestion` = the code
   question.
7. `assessments.submitAnswer` for the code question with `response: { source: "return 1" }`
   — expect `graded: true` (stub path), `nextQuestion: null`.
8. `assessments.submitSession` — expect `status: "graded"`, a numeric `rawScore` and
   `percentile`.
9. `assessments.myHistory` — expect one entry matching step 8's result.

Expected: every call succeeds with the shapes above; no unhandled errors in the API or
worker console.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routers/assessments.ts
git commit -m "feat(api): rewrite assessments router — streamed session runner"
```

---

## Self-Review Notes

- **Spec coverage:** every Foundation-spec section has a task — data model (Task 3), scoring
  engine (Task 1), Judge0 grading (Tasks 4-5, 7), real-time (Task 8), API surface (Tasks
  9-10). `matching.ts`/`scoreMatch`/`rankCandidates` from trafy-platform were intentionally
  **not** ported — the Foundation spec's scope list only names `scoring.ts`; job-candidate
  ranking belongs to the Layer 2 spec that consumes Trafy Points, not this one.
- **Known breakage (called out in the spec, not silently introduced):** `apps/web/src/app/assess/**`
  and `apps/mobile/app/(tabs)/assess/**` call the old `create`/`addQuestion`/`startAttempt`/
  `submitAttempt` procedure names and shapes removed in Tasks 9-10. They will not compile/run
  against the new router until updated — that update is explicitly out of scope for this plan
  (spec: "Out of scope here").
- **Type consistency check:** `RunnerQuestion.kind` uses `BankQuestionKind` throughout
  (Task 2); `gradeSyncAnswer`'s first parameter type (`Exclude<BankQuestionKind, "code">`,
  Task 5) matches every call site in Task 10 (`question.kind as "single_choice" |
  "multi_choice" | "short_answer"` — the `code` branch is handled separately before that
  call). `finalizeSession`'s input/output shape (Task 6) matches both call sites that use it
  (Task 7's worker, Task 10's `submitSession`).
