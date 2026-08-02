# Assessment Foundation (Trafy Points, Question Bank, Real Judge0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `trafy-community`'s one-off pass/fail assessment model with the Trafy Points model already built and tested in the sibling `trafy-platform` repo (`d:\downloads\trafy\`) — a reusable question bank, streamed sessions with integrity telemetry, real Judge0 code execution via a BullMQ worker, and a cohort-percentile-per-track score (`track_results`) that decays over time and composites into a single 0–100 number.

**Architecture:** tRPC `assessments` router reads/writes five new Postgres tables (`question_bank`, `assessments`, `assessment_sessions`, `answers`, `track_results`) via Drizzle. Single/multi-choice and short-answer questions grade synchronously in the mutation handler; `code` questions either grade synchronously via a keyword-rubric dev stub (no `JUDGE0_URL`) or get enqueued to a BullMQ `grade-code` queue that a separate worker process drains, calling Judge0 and writing the result back. Whichever path finalizes last computes the session's `rawScore` (weighted by question kind) and `percentile` (rank vs. other users' `track_results` on the same track), and emits Socket.IO events over the existing gateway.

**Tech Stack:** Fastify 5 + tRPC 10, Drizzle ORM + Postgres, ioredis + BullMQ, Socket.IO, Zod, Vitest (new to this repo — see Global Constraints).

## Global Constraints

- Follow this repo's existing schema convention: plain `text()` columns with a comment listing the union, validated in Zod — **not** `pgEnum` (unlike trafy-platform's schema). Every new table below follows this.
- Question kinds stay this repo's existing 4: `single_choice`, `multi_choice`, `short_answer`, `code` (underscore naming, matching the existing `@trafy-community/core` convention) — **not** trafy-platform's 5-kind split (`debugging`/`programming` separate). This was decided in the spec (`docs/superpowers/specs/2026-08-02-assessment-foundation-design.md`, "Data model" section: "kind ... same 4 kinds as today").
- Verified score scale is native 0–100 (percentile-based), no conversion layer to any other scale — decided in the spec's "Score scale (resolved ambiguity)" section. Gate/filter language elsewhere must say "≥ N Trafy Points," never "≥ 650."
- `JUDGE0_URL` is optional; `usingCodeGradingStub = !env.JUDGE0_URL` (already defined in `apps/api/src/lib/env.ts:39`) gates every code-grading code path — local dev without Docker's Judge0 profile must work end-to-end via the keyword-rubric fallback.
- All new relative imports use explicit `.js` extensions (this repo's `NodeNext` module resolution convention — see any existing router for the pattern).
- Existing web (`apps/web/src/app/assess/**`) and mobile (`apps/mobile/app/(tabs)/assess/**`) pages call the old router shape and **will break** after this plan. Fixing them is explicitly out of scope (tracked separately per the spec) — do not touch those directories in this plan.
- This repo has **zero existing tests or test config** (`apps/api`, `packages/core` both lack vitest today, unlike trafy-platform). Task 1 introduces it from scratch, minimally.

---

### Task 1: Add test infra + new dependencies

**Files:**
- Modify: `packages/core/package.json`
- Modify: `apps/api/package.json`

**Interfaces:**
- Produces: `npm test -w packages/core` and `npm test -w apps/api` both runnable (`vitest run`).

- [ ] **Step 1: Add `vitest` to `packages/core/package.json`**

Add to `devDependencies`: `"vitest": "^3.0.5"`. Add to `scripts`: `"test": "vitest run"`.

- [ ] **Step 2: Add `vitest` and `bullmq` to `apps/api/package.json`**

Add to `dependencies`: `"bullmq": "^5.34.8"`. Add to `devDependencies`: `"vitest": "^3.0.5"`. Add to `scripts`: `"test": "vitest run"`, `"worker": "tsx src/worker.ts"`.

- [ ] **Step 3: Add a root convenience script**

In `trafy-community/package.json` (root), add to `scripts`: `"dev:worker": "npm run worker -w apps/api"`.

- [ ] **Step 4: Install**

Run: `npm install` (from `trafy-community/` root — npm workspaces will hoist correctly).
Expected: lockfile updates, no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json packages/core/package.json apps/api/package.json package-lock.json
git commit -m "chore: add vitest and bullmq for assessment foundation"
```

---

### Task 2: Port the Trafy Points scoring engine

**Files:**
- Create: `packages/core/src/scoring.ts`
- Create: `packages/core/test/scoring.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `decayFactor(earnedAt: Date, now?: Date): number`, `decayedScore(result: { percentile: number; earnedAt: Date }, now?: Date): number`, `computeTrafyPoints(results: TrackResult[], now?: Date): number`, `percentileOf(raw: number, cohort: number[]): number`, `monthsBetween(from: Date, to: Date): number`, and type `TrackResult = { track: Track; percentile: number; earnedAt: Date }` (uses the `Track` union defined in Task 3).
- Consumes: nothing (pure, no DB).

This is a verbatim port of `d:\downloads\trafy\packages\core\src\scoring.ts` — the logic is unchanged; only the `TrackResult` type's `track` field now points at this repo's own `Track` union (defined in Task 3) instead of trafy-platform's.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/scoring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeTrafyPoints, decayFactor, percentileOf, type TrackResult } from "../src/scoring";

const NOW = new Date("2026-07-01T00:00:00Z");

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
    expect(pts).toBe(70); // (90 + 15) / 1.5
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w packages/core`
Expected: FAIL — `Cannot find module '../src/scoring'`

- [ ] **Step 3: Write `packages/core/src/scoring.ts`**

```ts
import type { TrackResult } from "./types.js";

/**
 * Trafy Points — the single 0-100 number companies see.
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

- [ ] **Step 4: Export `TrackResult` type from `types.ts` referenced above**

This is created in Task 3 (`packages/core/src/types.ts` doesn't exist yet in this repo — Task 3 Step 3 creates it before this file can typecheck). If running this task before Task 3, temporarily skip the typecheck and come back — but since Task 3 depends on nothing here, do Task 3's `types.ts` step first if executing out of order. (Tasks are numbered for logical grouping, not required order — Task 2 and Task 3 have no dependency on each other's non-type pieces, but this one type import means `types.ts` must exist before `scoring.ts` typechecks.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w packages/core`
Expected: PASS (12 tests)

- [ ] **Step 6: Export from `packages/core/src/index.ts`**

Add: `export * from "./scoring.js";`

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/scoring.ts packages/core/test/scoring.test.ts packages/core/src/index.ts
git commit -m "feat(core): port Trafy Points scoring engine from trafy-platform"
```

---

### Task 3: Rewrite the core assessment domain module

**Files:**
- Create: `packages/core/src/types.ts`
- Modify: `packages/core/src/assessment.ts` (full rewrite — replaces the old question/attempt schemas)
- Create: `packages/core/test/assessment.test.ts` (replaces nothing — no prior test file existed)
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces (used by Task 9's router and Task 10's worker):
  - Types: `Track`, `QuestionKind`, `CodeLanguage`, `TestCase`, `SingleChoicePayload`, `MultiChoicePayload`, `ShortAnswerPayload`, `CodePayload`, `SafePayload`, `SyncGradeResult`, `BankQuestion`, `AssessmentSummary`, `StartSessionResult`, `NextQuestionResult`, `SubmitSessionResult`, `TrackResultHistoryItem`
  - Zod schemas/inputs: `trackSchema`, `questionKindSchema`, `codeLanguageSchema`, `testCaseSchema`, `singleChoicePayloadSchema`, `multiChoicePayloadSchema`, `shortAnswerPayloadSchema`, `codePayloadSchema`, `createBankQuestionInput`, `updateBankQuestionInput`, `listBankQuestionsInput`, `createAssessmentInput`, `startSessionInput`, `getNextQuestionInput`, `answerResponseSchema`, `submitAnswerInput`, `recordTelemetryInput`, `submitSessionInput`
  - Functions: `toSafePayload(kind, payload)`, `gradeSingleChoice`, `gradeMultiChoice`, `gradeShortAnswer`, `isAsyncGraded(kind)`, `gradeSyncAnswer(kind, payload, response)`, `buildSessionPlan(poolByKind, blueprint?, rng?)`, `computeRawScore(gradedAnswers)`
  - Constants: `TRACKS`, `QUESTION_KINDS`, `CODE_LANGUAGES`, `ASSESSMENT_BLUEPRINT`, `KIND_WEIGHTS`
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/assessment.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ASSESSMENT_BLUEPRINT,
  QUESTION_KINDS,
  buildSessionPlan,
  computeRawScore,
  gradeMultiChoice,
  gradeShortAnswer,
  gradeSingleChoice,
  gradeSyncAnswer,
  isAsyncGraded,
  toSafePayload,
  type MultiChoicePayload,
  type ShortAnswerPayload,
  type SingleChoicePayload,
} from "../src/assessment";

describe("gradeSingleChoice", () => {
  const payload: SingleChoicePayload = { options: ["a", "b", "c"], correctIndex: 1 };
  it("scores 1 on the correct index", () => {
    expect(gradeSingleChoice(payload, { selectedIndex: 1 })).toEqual({ correct: true, scoreFraction: 1 });
  });
  it("scores 0 on a wrong index", () => {
    expect(gradeSingleChoice(payload, { selectedIndex: 0 })).toEqual({ correct: false, scoreFraction: 0 });
  });
  it("scores 0 on a missing response", () => {
    expect(gradeSingleChoice(payload, {})).toEqual({ correct: false, scoreFraction: 0 });
  });
});

describe("gradeMultiChoice", () => {
  const payload: MultiChoicePayload = { options: ["a", "b", "c", "d"], correctIndices: [0, 2] };
  it("scores 1 on an exact match regardless of order", () => {
    expect(gradeMultiChoice(payload, { selectedIndices: [2, 0] }).scoreFraction).toBe(1);
  });
  it("gives partial credit for a partially-correct selection", () => {
    const r = gradeMultiChoice(payload, { selectedIndices: [0] });
    expect(r.scoreFraction).toBe(0.5);
    expect(r.correct).toBe(false);
  });
  it("penalizes false positives via Jaccard", () => {
    const r = gradeMultiChoice(payload, { selectedIndices: [0, 1, 2, 3] });
    expect(r.scoreFraction).toBe(0.5);
  });
  it("scores 0 on an empty selection", () => {
    expect(gradeMultiChoice(payload, { selectedIndices: [] }).scoreFraction).toBe(0);
  });
});

describe("gradeShortAnswer", () => {
  const payload: ShortAnswerPayload = { acceptable: ["Paris"] };
  it("matches case-insensitively and trims by default", () => {
    expect(gradeShortAnswer(payload, { text: "  paris  " }).correct).toBe(true);
  });
  it("rejects wrong answers", () => {
    expect(gradeShortAnswer(payload, { text: "London" }).correct).toBe(false);
  });
  it("respects caseSensitive: true", () => {
    const strict: ShortAnswerPayload = { acceptable: ["Paris"], caseSensitive: true };
    expect(gradeShortAnswer(strict, { text: "paris" }).correct).toBe(false);
    expect(gradeShortAnswer(strict, { text: "Paris" }).correct).toBe(true);
  });
});

describe("isAsyncGraded / gradeSyncAnswer", () => {
  it("code is async and returns null from gradeSyncAnswer", () => {
    expect(isAsyncGraded("code")).toBe(true);
    expect(
      gradeSyncAnswer("code", { language: "python", keywords: ["def"], hiddenTestCases: [] }, {}),
    ).toBeNull();
  });
  it("non-code kinds are sync", () => {
    expect(isAsyncGraded("single_choice")).toBe(false);
    expect(isAsyncGraded("multi_choice")).toBe(false);
    expect(isAsyncGraded("short_answer")).toBe(false);
  });
});

describe("toSafePayload", () => {
  it("strips the answer key from choice kinds", () => {
    const safe = toSafePayload("single_choice", { options: ["a", "b"], correctIndex: 0 });
    expect(safe).toEqual({ options: ["a", "b"] });
    expect(safe).not.toHaveProperty("correctIndex");
  });
  it("strips acceptable answers from short_answer", () => {
    expect(toSafePayload("short_answer", { acceptable: ["x"] })).toEqual({});
  });
  it("strips hiddenTestCases and keywords from code", () => {
    const safe = toSafePayload("code", {
      language: "python",
      starterCode: "def solve(): pass",
      hiddenTestCases: [{ input: "1", expected: "1" }],
      keywords: ["def", "return"],
    });
    expect(safe).toEqual({ language: "python", starterCode: "def solve(): pass" });
  });
});

describe("buildSessionPlan", () => {
  it("selects exactly the blueprint count per kind when the pool is large enough", () => {
    const pool: Record<string, string[]> = {};
    for (const kind of QUESTION_KINDS) {
      pool[kind] = Array.from({ length: 20 }, (_, i) => `${kind}-${i}`);
    }
    const plan = buildSessionPlan(pool);
    const total = Object.values(ASSESSMENT_BLUEPRINT).reduce((a, b) => a + b, 0);
    expect(plan).toHaveLength(total);
    const all = new Set(Object.values(pool).flat());
    expect(plan.every((id) => all.has(id))).toBe(true);
  });

  it("degrades gracefully when a kind has fewer questions than the blueprint wants", () => {
    const plan = buildSessionPlan({ single_choice: ["a", "b"], multi_choice: [], short_answer: [], code: [] });
    expect(plan).toHaveLength(2); // blueprint wants 4, only 2 exist
  });

  it("returns an empty plan when no pools are provided", () => {
    expect(buildSessionPlan({})).toEqual([]);
  });

  it("is deterministic given a fixed rng", () => {
    const pool = { single_choice: ["a", "b", "c", "d", "e"] };
    const rng = () => 0.4;
    const blueprint = { single_choice: 3, multi_choice: 0, short_answer: 0, code: 0 };
    const a = buildSessionPlan(pool, blueprint, rng);
    const b = buildSessionPlan(pool, blueprint, rng);
    expect(a).toEqual(b);
  });
});

describe("computeRawScore", () => {
  it("returns 0 for no graded answers", () => {
    expect(computeRawScore([])).toBe(0);
  });
  it("weights harder kinds more heavily", () => {
    const allCorrectEasy = computeRawScore([
      { kind: "single_choice", scoreFraction: 1 },
      { kind: "single_choice", scoreFraction: 1 },
    ]);
    expect(allCorrectEasy).toBe(1);

    const mixedWeighted = computeRawScore([
      { kind: "single_choice", scoreFraction: 1 }, // weight 1
      { kind: "code", scoreFraction: 0 }, // weight 2
    ]);
    expect(mixedWeighted).toBeCloseTo(1 / 3, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w packages/core`
Expected: FAIL — `gradeSingleChoice` etc. not exported from `../src/assessment` (old file has different exports)

- [ ] **Step 3: Create `packages/core/src/types.ts`**

```ts
import { z } from "zod";

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

- [ ] **Step 4: Replace `packages/core/src/assessment.ts` entirely**

```ts
import { z } from "zod";
import { trackSchema } from "./types.js";

/**
 * Assessment question kinds and their contract. This file is the source of
 * truth for: authoring payload shape, what gets sent to the client
 * (toSafePayload strips answer keys), how each kind is graded, how a
 * session's questions are chosen (buildSessionPlan), and how a session's
 * overall score is weighted (computeRawScore).
 */

export const QUESTION_KINDS = ["single_choice", "multi_choice", "short_answer", "code"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];
export const questionKindSchema = z.enum(QUESTION_KINDS);

export const CODE_LANGUAGES = ["python", "javascript", "typescript", "go", "java", "cpp"] as const;
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];
export const codeLanguageSchema = z.enum(CODE_LANGUAGES);

/* ── Per-kind payload schemas (author-facing — includes the answer key) ── */

export const singleChoicePayloadSchema = z
  .object({
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(10),
    correctIndex: z.number().int().min(0),
  })
  .refine((p) => p.correctIndex < p.options.length, { message: "correctIndex must index into options" });
export type SingleChoicePayload = z.infer<typeof singleChoicePayloadSchema>;

export const multiChoicePayloadSchema = z
  .object({
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(10),
    correctIndices: z.array(z.number().int().min(0)).min(1),
  })
  .refine((p) => p.correctIndices.every((i) => i < p.options.length), {
    message: "correctIndices must index into options",
  })
  .refine((p) => new Set(p.correctIndices).size === p.correctIndices.length, {
    message: "correctIndices must not contain duplicates",
  });
export type MultiChoicePayload = z.infer<typeof multiChoicePayloadSchema>;

export const shortAnswerPayloadSchema = z.object({
  acceptable: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  caseSensitive: z.boolean().optional(),
});
export type ShortAnswerPayload = z.infer<typeof shortAnswerPayloadSchema>;

export const testCaseSchema = z.object({ input: z.string(), expected: z.string() });
export type TestCase = z.infer<typeof testCaseSchema>;

export const codePayloadSchema = z.object({
  language: codeLanguageSchema.default("python"),
  starterCode: z.string().max(10000).optional(),
  /** Only used when JUDGE0_URL is configured. */
  hiddenTestCases: z.array(testCaseSchema).default([]),
  /** Dev-stub grading rubric — fraction of these keywords present in the
   *  submission. Used when !JUDGE0_URL (usingCodeGradingStub). */
  keywords: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
});
export type CodePayload = z.infer<typeof codePayloadSchema>;

/* ── Safe payload (client-facing — answer keys stripped) ── */

export type SafePayload = { options: string[] } | Record<string, never> | { language: CodeLanguage; starterCode?: string };

export function toSafePayload(kind: QuestionKind, payload: unknown): SafePayload {
  switch (kind) {
    case "single_choice":
    case "multi_choice": {
      const p = payload as SingleChoicePayload | MultiChoicePayload;
      return { options: p.options };
    }
    case "short_answer":
      return {};
    case "code": {
      const p = payload as CodePayload;
      return { language: p.language, starterCode: p.starterCode };
    }
  }
}

/* ── Grading ── */

export type SyncGradeResult = { correct: boolean; scoreFraction: number };

export function gradeSingleChoice(payload: SingleChoicePayload, response: unknown): SyncGradeResult {
  const chosen = (response as { selectedIndex?: number } | null | undefined)?.selectedIndex;
  const correct = chosen === payload.correctIndex;
  return { correct, scoreFraction: correct ? 1 : 0 };
}

/** Partial credit via Jaccard index — rewards partially-correct selections
 *  while penalizing false positives (ticking every option scores 0). */
export function gradeMultiChoice(payload: MultiChoicePayload, response: unknown): SyncGradeResult {
  const chosen = new Set((response as { selectedIndices?: number[] } | null | undefined)?.selectedIndices ?? []);
  const correctSet = new Set(payload.correctIndices);
  const intersection = [...chosen].filter((i) => correctSet.has(i)).length;
  const union = new Set([...chosen, ...correctSet]).size;
  const scoreFraction = union === 0 ? 0 : intersection / union;
  return { correct: scoreFraction === 1, scoreFraction };
}

export function gradeShortAnswer(payload: ShortAnswerPayload, response: unknown): SyncGradeResult {
  const raw = (response as { text?: string } | null | undefined)?.text ?? "";
  const normalize = (s: string) => (payload.caseSensitive ? s.trim() : s.trim().toLowerCase());
  const norm = normalize(raw);
  const correct = payload.acceptable.some((a) => normalize(a) === norm);
  return { correct, scoreFraction: correct ? 1 : 0 };
}

/** code is graded by Judge0 in a background worker (or the keyword stub, synchronously, when !JUDGE0_URL — see apps/api). */
export function isAsyncGraded(kind: QuestionKind): boolean {
  return kind === "code";
}

/** Returns null for code — caller must grade it via the stub or queue Judge0 instead. */
export function gradeSyncAnswer(kind: QuestionKind, payload: unknown, response: unknown): SyncGradeResult | null {
  switch (kind) {
    case "single_choice":
      return gradeSingleChoice(payload as SingleChoicePayload, response);
    case "multi_choice":
      return gradeMultiChoice(payload as MultiChoicePayload, response);
    case "short_answer":
      return gradeShortAnswer(payload as ShortAnswerPayload, response);
    case "code":
      return null;
  }
}

/* ── Session composition ── */

/** Default question mix per session (10 questions total). Gracefully shrinks
 *  when a track doesn't yet have enough of a kind seeded. */
export const ASSESSMENT_BLUEPRINT: Record<QuestionKind, number> = {
  single_choice: 4,
  multi_choice: 2,
  short_answer: 2,
  code: 2,
};

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/** Picks a randomized, blueprint-weighted set of question ids from a pool
 *  already grouped by kind. Pure — no DB access — fully unit-testable. */
export function buildSessionPlan(
  poolByKind: Partial<Record<QuestionKind, string[]>>,
  blueprint: Record<QuestionKind, number> = ASSESSMENT_BLUEPRINT,
  rng: () => number = Math.random,
): string[] {
  const selected: string[] = [];
  for (const kind of QUESTION_KINDS) {
    const pool = poolByKind[kind] ?? [];
    const count = blueprint[kind] ?? 0;
    selected.push(...shuffle(pool, rng).slice(0, count));
  }
  return shuffle(selected, rng);
}

/* ── Scoring ── */

/** Harder / higher-signal kinds count for more of the overall raw score. */
export const KIND_WEIGHTS: Record<QuestionKind, number> = {
  single_choice: 1,
  multi_choice: 1.25,
  short_answer: 1,
  code: 2,
};

/** Weighted average of already-graded answers. Ungraded (pending Judge0)
 *  answers must be excluded by the caller before calling this. */
export function computeRawScore(gradedAnswers: Array<{ kind: QuestionKind; scoreFraction: number }>): number {
  if (gradedAnswers.length === 0) return 0;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const a of gradedAnswers) {
    const w = KIND_WEIGHTS[a.kind];
    weightedSum += a.scoreFraction * w;
    weightTotal += w;
  }
  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

/* ── Bank authoring (tRPC input) ── */

const skillTagsField = z.array(z.string().trim().min(1).max(60)).max(10).default([]);

export const createBankQuestionInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("single_choice"),
    track: trackSchema,
    skillTags: skillTagsField,
    difficulty: z.number().int().min(1).max(5).default(1),
    prompt: z.string().trim().min(1).max(4000),
    payload: singleChoicePayloadSchema,
  }),
  z.object({
    kind: z.literal("multi_choice"),
    track: trackSchema,
    skillTags: skillTagsField,
    difficulty: z.number().int().min(1).max(5).default(1),
    prompt: z.string().trim().min(1).max(4000),
    payload: multiChoicePayloadSchema,
  }),
  z.object({
    kind: z.literal("short_answer"),
    track: trackSchema,
    skillTags: skillTagsField,
    difficulty: z.number().int().min(1).max(5).default(1),
    prompt: z.string().trim().min(1).max(4000),
    payload: shortAnswerPayloadSchema,
  }),
  z.object({
    kind: z.literal("code"),
    track: trackSchema,
    skillTags: skillTagsField,
    difficulty: z.number().int().min(1).max(5).default(1),
    prompt: z.string().trim().min(1).max(4000),
    payload: codePayloadSchema,
  }),
]);
export type CreateBankQuestionInput = z.infer<typeof createBankQuestionInput>;

export const updateBankQuestionInput = z.object({
  questionId: z.string().uuid(),
  active: z.boolean().optional(),
  prompt: z.string().trim().min(1).max(4000).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  skillTags: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
});
export type UpdateBankQuestionInput = z.infer<typeof updateBankQuestionInput>;

export const listBankQuestionsInput = z.object({
  track: trackSchema.optional(),
  skillTag: z.string().trim().max(60).optional(),
});
export type ListBankQuestionsInput = z.infer<typeof listBankQuestionsInput>;

export const bankQuestionSchema = z.object({
  id: z.string().uuid(),
  externalId: z.string().nullable(),
  track: trackSchema,
  skillTags: z.array(z.string()),
  kind: questionKindSchema,
  difficulty: z.number().int(),
  prompt: z.string(),
  payload: z.unknown(),
  active: z.boolean(),
  authorId: z.string().uuid(),
  createdAt: z.string(),
});
export type BankQuestion = z.infer<typeof bankQuestionSchema>;

/* ── Assessment definitions (tRPC input/output) ── */

export const createAssessmentInput = z.object({
  title: z.string().trim().min(1).max(200),
  track: trackSchema,
  layer: z.union([z.literal(1), z.literal(2)]).default(1),
  timeLimitSeconds: z
    .number()
    .int()
    .min(30)
    .max(4 * 60 * 60)
    .optional(),
  questionIds: z.array(z.string().uuid()).min(1).max(50),
  jobId: z.string().uuid().optional(),
});
export type CreateAssessmentInput = z.infer<typeof createAssessmentInput>;

export const assessmentSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  track: trackSchema,
  layer: z.number().int(),
  timeLimitSeconds: z.number().int().nullable(),
  questionCount: z.number().int().nonnegative(),
  jobId: z.string().uuid().nullable(),
  authorId: z.string().uuid(),
  authorName: z.string(),
  createdAt: z.string(),
});
export type AssessmentSummary = z.infer<typeof assessmentSummarySchema>;

/* ── Sessions (runner, tRPC input/output) ── */

export const startSessionInput = z.object({ assessmentId: z.string().uuid() });
export type StartSessionInput = z.infer<typeof startSessionInput>;

export const startSessionResultSchema = z.object({ sessionId: z.string().uuid(), resumed: z.boolean() });
export type StartSessionResult = z.infer<typeof startSessionResultSchema>;

export const getNextQuestionInput = z.object({ sessionId: z.string().uuid(), index: z.number().int().min(0) });
export type GetNextQuestionInput = z.infer<typeof getNextQuestionInput>;

export const nextQuestionResultSchema = z.discriminatedUnion("done", [
  z.object({ done: z.literal(true), total: z.number().int() }),
  z.object({
    done: z.literal(false),
    total: z.number().int(),
    index: z.number().int(),
    question: z.object({
      id: z.string().uuid(),
      kind: questionKindSchema,
      prompt: z.string(),
      payload: z.unknown(),
    }),
    expiresAt: z.string(),
  }),
]);
export type NextQuestionResult = z.infer<typeof nextQuestionResultSchema>;

export const answerResponseSchema = z.object({
  selectedIndex: z.number().int().optional(),
  selectedIndices: z.array(z.number().int()).optional(),
  text: z.string().max(20000).optional(),
  source: z.string().max(50000).optional(),
});
export type AnswerResponsePayload = z.infer<typeof answerResponseSchema>;

export const submitAnswerInput = z.object({
  sessionId: z.string().uuid(),
  questionId: z.string().uuid(),
  response: answerResponseSchema,
});
export type SubmitAnswerInput = z.infer<typeof submitAnswerInput>;

export const recordTelemetryInput = z.object({
  sessionId: z.string().uuid(),
  event: z.enum(["blur", "paste", "fullscreen-exit"]),
});
export type RecordTelemetryInput = z.infer<typeof recordTelemetryInput>;

export const submitSessionInput = z.object({ sessionId: z.string().uuid() });
export type SubmitSessionInput = z.infer<typeof submitSessionInput>;

export const submitSessionResultSchema = z.object({
  rawScore: z.number(),
  percentile: z.number(),
  pending: z.boolean(),
});
export type SubmitSessionResult = z.infer<typeof submitSessionResultSchema>;

export const trackResultHistoryItemSchema = z.object({
  sessionId: z.string().uuid(),
  assessmentId: z.string().uuid(),
  assessmentTitle: z.string(),
  track: trackSchema,
  rawScore: z.number(),
  percentile: z.number(),
  earnedAt: z.string(),
});
export type TrackResultHistoryItem = z.infer<typeof trackResultHistoryItemSchema>;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w packages/core`
Expected: PASS (all scoring.test.ts + assessment.test.ts tests)

- [ ] **Step 6: Update `packages/core/src/index.ts`**

Replace `export * from "./assessment.js";` (keep it — same filename, new contents) and add `export * from "./types.js";` above it.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/assessment.ts packages/core/test/assessment.test.ts packages/core/src/index.ts
git commit -m "feat(core): rewrite assessment domain module for question-bank + session model"
```

---

### Task 4: Replace the assessment tables in the DB schema

**Files:**
- Modify: `packages/db/src/schema.ts`

**Interfaces:**
- Produces: `schema.questionBank`, `schema.assessments` (redefined), `schema.assessmentSessions`, `schema.answers`, `schema.trackResults` — Drizzle tables consumed by Task 9's router and Task 10's worker.
- Consumes: `schema.users`, `schema.jobs` (existing).

- [ ] **Step 1: Add `varchar` to the drizzle-orm/pg-core import**

In `packages/db/src/schema.ts`, add `varchar` to the existing import list (alongside `boolean, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, unique, uuid`).

- [ ] **Step 2: Delete the old assessment tables**

Remove the `assessments`, `assessmentQuestions`, `assessmentAttempts`, `attemptAnswers` exports (currently lines 394-465, under the "Milestone 4 — Groups & assessments" comment).

- [ ] **Step 3: Insert the five new tables in their place**

```ts
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
  (table) => [index("question_bank_track_idx").on(table.track), index("question_bank_author_idx").on(table.authorId)],
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
  (table) => [index("assessments_author_idx").on(table.authorId), index("assessments_job_idx").on(table.jobId)],
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
  ],
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
  ],
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
  ],
);
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck -w packages/db`
Expected: PASS. (Note: `assessments.jobId` forward-references `jobs`, declared later in the same file — this is fine, `references()` takes a lazily-invoked closure, matching the existing pattern `courses.organizationId` uses for `organizations`.)

- [ ] **Step 5: Generate the migration**

Run: `npm run db:generate -w packages/db`
Expected: a new file under `packages/db/migrations/` dropping `assessment_questions`, `assessment_attempts`, `attempt_answers`, altering `assessments`, and creating `question_bank`, `assessment_sessions`, `answers`, `track_results`. Read the generated SQL and confirm it matches — drizzle-kit sometimes asks interactively whether a column rename is a rename-or-drop-and-add; since this is a full replace, always answer "create new" / accept drops, never "rename."

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations/
git commit -m "feat(db): replace assessment tables with question-bank/session/track-result model"
```

---

### Task 5: Redis queue module (BullMQ producer)

**Files:**
- Create: `apps/api/src/lib/queue.ts`

**Interfaces:**
- Produces: `getQueues(): { gradeCode: Queue<GradeCodeJob> }`, `queueConnection(): ConnectionOptions` (for the Task 10 worker), `tryEnqueue(job: Promise<unknown>, label: string): Promise<void>`, type `GradeCodeJob = { answerId: string; sessionId: string }`.
- Consumes: `env.REDIS_URL` from `./env.js` (already validated, required).

This ports `d:\downloads\trafy\api\src\queue.ts`, dropping the `mailLifecycle` queue (not relevant here) and pointing at this repo's own `env.js` instead of raw `process.env`.

- [ ] **Step 1: Write `apps/api/src/lib/queue.ts`**

```ts
import { Queue } from "bullmq";
import { env } from "./env.js";

function connection() {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    tls: url.protocol === "rediss:" ? {} : undefined, // Upstash requires TLS on rediss://
  };
}

/** Producer-only connection (API side). Fails fast instead of hanging when
 *  Redis is unreachable: ioredis's default retryStrategy retries forever,
 *  and BullMQ's internal waitUntilReady() blocks on that regardless of
 *  enableOfflineQueue — so the retry count itself must be bounded. NEVER use
 *  this for a Worker/QueueEvents — BullMQ requires maxRetriesPerRequest: null
 *  on those blocking connections (see queueConnection). */
function producerConnection() {
  return {
    ...connection(),
    enableOfflineQueue: false,
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
    retryStrategy: (times: number) => (times > 2 ? null : 150),
  };
}

export type GradeCodeJob = { answerId: string; sessionId: string };

let queues: { gradeCode: Queue<GradeCodeJob> } | null = null;

export function getQueues() {
  if (!queues) {
    queues = {
      gradeCode: new Queue<GradeCodeJob>("grade-code", {
        connection: producerConnection(),
        // 3 attempts with exponential backoff — matches the spec's error-handling
        // section: never silently drop a submission, but don't retry forever.
        defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
      }),
    };
  }
  return queues;
}

/** For Worker/QueueEvents (consumer side) — do not add retry/offline-queue
 *  overrides here; BullMQ requires maxRetriesPerRequest: null on those. */
export const queueConnection = connection;

/** Best-effort enqueue: warns and resolves instead of throwing/hanging when
 *  Redis is unreachable (e.g. local dev without Redis running). The job
 *  simply never gets queued — the caller's data stays in its pending state
 *  until Redis + a worker are available. */
export async function tryEnqueue(job: Promise<unknown>, label: string): Promise<void> {
  try {
    await job;
  } catch (err) {
    console.warn(`[queue] could not enqueue ${label} (Redis unavailable?):`, (err as Error).message);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w apps/api`
Expected: PASS (no other file imports this yet, so this alone should already typecheck cleanly).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/queue.ts
git commit -m "feat(api): add BullMQ producer queue for code grading"
```

---

### Task 6: Judge0 client

**Files:**
- Create: `apps/api/src/lib/judge0.ts`

**Interfaces:**
- Produces: `runCase(source, language, testCase, timeoutMs?): Promise<CaseResult>`, `gradeSubmission(source, language, testCases): Promise<{ scoreFraction: number; results: CaseResult[] }>`, `JUDGE0_LANGUAGES`.
- Consumes: `env.JUDGE0_URL` from `./env.js`.

Ports `d:\downloads\trafy\api\src\services\judge0.ts` verbatim, swapping `process.env.JUDGE0_URL` for this repo's validated `env.JUDGE0_URL`.

- [ ] **Step 1: Write `apps/api/src/lib/judge0.ts`**

```ts
/**
 * Judge0 CE client — executes untrusted assessment code against hidden test
 * cases. Self-hosted via `docker compose --profile sandbox up -d` (add this
 * profile to docker-compose.yml if it isn't there yet — see Task 12).
 */
import { env } from "./env.js";

const JUDGE0_URL = () => env.JUDGE0_URL ?? "http://localhost:2358";

/** Language name (stored on questions) -> Judge0 language id. */
export const JUDGE0_LANGUAGES: Record<string, number> = {
  python: 71,
  javascript: 63,
  typescript: 74,
  go: 60,
  java: 62,
  cpp: 54,
};

export type TestCase = { input: string; expected: string };

export type CaseResult = {
  passed: boolean;
  stdout: string | null;
  stderr: string | null;
  statusDescription: string;
};

type Judge0Submission = {
  stdout: string | null;
  stderr: string | null;
  status: { id: number; description: string };
};

/** Run one source file against one test case (synchronous wait mode). */
export async function runCase(
  source: string,
  language: string,
  testCase: TestCase,
  timeoutMs = 15_000,
): Promise<CaseResult> {
  const languageId = JUDGE0_LANGUAGES[language];
  if (!languageId) throw new Error(`Unsupported language: ${language}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${JUDGE0_URL()}/submissions?wait=true&base64_encoded=false`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        source_code: source,
        language_id: languageId,
        stdin: testCase.input,
        expected_output: testCase.expected,
        cpu_time_limit: 5,
        memory_limit: 256_000,
      }),
    });
    if (!res.ok) throw new Error(`Judge0 ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as Judge0Submission;
    return {
      passed: data.status.id === 3, // 3 = Accepted (output matched expected_output)
      stdout: data.stdout,
      stderr: data.stderr,
      statusDescription: data.status.description,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Grade a submission: fraction of hidden test cases passed. */
export async function gradeSubmission(
  source: string,
  language: string,
  testCases: TestCase[],
): Promise<{ scoreFraction: number; results: CaseResult[] }> {
  if (testCases.length === 0) return { scoreFraction: 0, results: [] };
  const results: CaseResult[] = [];
  for (const tc of testCases) {
    results.push(await runCase(source, language, tc));
  }
  const passed = results.filter((r) => r.passed).length;
  return { scoreFraction: passed / testCases.length, results };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w apps/api`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/judge0.ts
git commit -m "feat(api): add Judge0 client for real code execution"
```

---

### Task 7: Rewrite the grading stub

**Files:**
- Modify: `apps/api/src/lib/grading.ts` (full rewrite — the old `gradeAnswer` dispatcher moves into `@trafy-community/core`'s `gradeSyncAnswer`, ported in Task 3)
- Create: `apps/api/test/grading.test.ts`

**Interfaces:**
- Produces: `gradeCodeStub(payload: { keywords: string[] }, source: string): number`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/grading.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { gradeCodeStub } from "../src/lib/grading";

describe("gradeCodeStub", () => {
  it("scores the fraction of keywords present, case-insensitively", () => {
    const payload = { keywords: ["def", "return", "sorted"] };
    expect(gradeCodeStub(payload, "def solve(): return sorted([])")).toBe(1);
    expect(gradeCodeStub(payload, "def solve(): return []")).toBeCloseTo(2 / 3, 5);
  });
  it("scores 0 with no keywords present", () => {
    expect(gradeCodeStub({ keywords: ["def"] }, "x = 1")).toBe(0);
  });
  it("scores 0 with an empty keyword list", () => {
    expect(gradeCodeStub({ keywords: [] }, "anything")).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w apps/api`
Expected: FAIL — old `grading.ts` exports `gradeAnswer`, not `gradeCodeStub`.

- [ ] **Step 3: Replace `apps/api/src/lib/grading.ts`**

```ts
/**
 * Deterministic code grading fallback used when no JUDGE0_URL is configured
 * (usingCodeGradingStub, see ./env.js): fraction of the author's rubric
 * keywords present (case-insensitive substring) in the submitted source.
 * Replaced by real Judge0 hidden-test-case execution — see
 * apps/api/src/worker.ts — once JUDGE0_URL is set.
 */
export function gradeCodeStub(payload: { keywords: string[] }, source: string): number {
  const keywords = payload.keywords ?? [];
  if (keywords.length === 0) return 0;
  const haystack = source.toLowerCase();
  const hits = keywords.filter((kw) => haystack.includes(kw.toLowerCase())).length;
  return hits / keywords.length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w apps/api`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/grading.ts apps/api/test/grading.test.ts
git commit -m "feat(api): rewrite code grading stub for the new payload shape"
```

---

### Task 8: Real-time session + integrity events

**Files:**
- Modify: `apps/api/src/lib/realtime.ts`

**Interfaces:**
- Produces: `emitSessionAnswerGraded(sessionId, payload)`, `emitSessionGraded(sessionId, payload)`, `emitIntegrityFlag(assessmentId, payload)` — consumed by Task 9's router and Task 10's worker.
- Consumes: nothing new (uses the existing `io` module-level Socket.IO server).

- [ ] **Step 1: Add room join/leave handlers inside `initRealtime`'s `io.on("connection", ...)` block**

Directly below the existing `channel:join` / `channel:leave` / `typing` handlers, add:

```ts
    // Assessment runner: candidate joins their own session's room to
    // receive live grading updates (session:answer-graded, session:graded).
    socket.on("session:join", (sessionId: string) => {
      socket.join(`session:${sessionId}`);
    });
    socket.on("session:leave", (sessionId: string) => {
      socket.leave(`session:${sessionId}`);
    });

    // Recruiter/proctor view: joins to receive integrity:flag events for a
    // specific assessment while candidates are actively taking it.
    socket.on("assessment:live:join", (assessmentId: string) => {
      socket.join(`assessment:${assessmentId}:live`);
    });
    socket.on("assessment:live:leave", (assessmentId: string) => {
      socket.leave(`assessment:${assessmentId}:live`);
    });
```

- [ ] **Step 2: Add emit helpers below the existing `emitNotification` function**

```ts
export function emitSessionAnswerGraded(
  sessionId: string,
  payload: { questionId: string; scoreFraction: number },
): void {
  io?.to(`session:${sessionId}`).emit("session:answer-graded", payload);
}

export function emitSessionGraded(sessionId: string, payload: { rawScore: number; percentile: number }): void {
  io?.to(`session:${sessionId}`).emit("session:graded", payload);
}

export function emitIntegrityFlag(
  assessmentId: string,
  payload: { sessionId: string; userId: string; event: string; count: number },
): void {
  io?.to(`assessment:${assessmentId}:live`).emit("integrity:flag", payload);
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w apps/api`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/realtime.ts
git commit -m "feat(api): add session/integrity Socket.IO events for assessments"
```

---

### Task 9: Rewrite the assessments router

**Files:**
- Modify: `apps/api/src/routers/assessments.ts` (full rewrite)

**Interfaces:**
- Consumes: everything from Tasks 2, 3, 5, 7, 8 (`@trafy-community/core`'s scoring/assessment exports, `./lib/queue.js`, `./lib/grading.js`, `./lib/realtime.js`) plus existing `./lib/trpc.js`, `./lib/db.js`, `@trafy-community/db`'s `schema`.
- Produces: the `assessmentsRouter` consumed unchanged by `apps/api/src/routers/index.ts` (already wires it in under the `assessments` key — no change needed there).

- [ ] **Step 1: Replace `apps/api/src/routers/assessments.ts` entirely**

```ts
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import {
  buildSessionPlan,
  computeRawScore,
  createAssessmentInput,
  createBankQuestionInput,
  getNextQuestionInput,
  gradeSyncAnswer,
  isAsyncGraded,
  listBankQuestionsInput,
  percentileOf,
  recordTelemetryInput,
  startSessionInput,
  submitAnswerInput,
  submitSessionInput,
  toSafePayload,
  updateBankQuestionInput,
  type AssessmentSummary,
  type BankQuestion,
  type NextQuestionResult,
  type QuestionKind,
  type StartSessionResult,
  type SubmitSessionResult,
  type TrackResultHistoryItem,
} from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";
import { gradeCodeStub } from "../lib/grading.js";
import { usingCodeGradingStub } from "../lib/env.js";
import { getQueues, tryEnqueue } from "../lib/queue.js";
import { emitIntegrityFlag, emitSessionAnswerGraded, emitSessionGraded } from "../lib/realtime.js";

const SESSION_MINUTES = 45;
const INTEGRITY_FLAG_THRESHOLD = 3; // flag on the 3rd+ tab-blur/paste

async function authorName(userId: string): Promise<string> {
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1);
  return profile?.fullName || "";
}

function toBankQuestion(row: typeof schema.questionBank.$inferSelect): BankQuestion {
  return {
    id: row.id,
    externalId: row.externalId,
    track: row.track as BankQuestion["track"],
    skillTags: row.skillTags as string[],
    kind: row.kind as QuestionKind,
    difficulty: row.difficulty,
    prompt: row.prompt,
    payload: row.payload,
    active: row.active,
    authorId: row.authorId,
    createdAt: row.createdAt.toISOString(),
  };
}

async function toAssessmentSummary(row: typeof schema.assessments.$inferSelect): Promise<AssessmentSummary> {
  return {
    id: row.id,
    title: row.title,
    track: row.track as AssessmentSummary["track"],
    layer: row.layer,
    timeLimitSeconds: row.timeLimitSeconds,
    questionCount: (row.questionIds as string[]).length,
    jobId: row.jobId,
    authorId: row.authorId,
    authorName: await authorName(row.authorId),
    createdAt: row.createdAt.toISOString(),
  };
}

async function requireOwnActiveSession(sessionId: string, userId: string) {
  const [session] = await db
    .select()
    .from(schema.assessmentSessions)
    .where(eq(schema.assessmentSessions.id, sessionId))
    .limit(1);
  if (!session || session.userId !== userId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
  }
  if (session.status !== "active") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Session is not active." });
  }
  if (session.expiresAt <= new Date()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Session expired." });
  }
  return session;
}

export const assessmentsRouter = router({
  bank: router({
    create: protectedProcedure.input(createBankQuestionInput).mutation(async ({ ctx, input }) => {
      const { kind, track, skillTags, difficulty, prompt, payload } = input;
      const [row] = await db
        .insert(schema.questionBank)
        .values({ authorId: ctx.user.sub, kind, track, skillTags, difficulty, prompt, payload })
        .returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toBankQuestion(row);
    }),

    update: protectedProcedure.input(updateBankQuestionInput).mutation(async ({ ctx, input }) => {
      const { questionId, ...rest } = input;
      const [existing] = await db.select().from(schema.questionBank).where(eq(schema.questionBank.id, questionId)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (existing.authorId !== ctx.user.sub) throw new TRPCError({ code: "FORBIDDEN", message: "Not your question." });
      const [row] = await db
        .update(schema.questionBank)
        .set({ ...rest, updatedAt: new Date() })
        .where(eq(schema.questionBank.id, questionId))
        .returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toBankQuestion(row);
    }),

    list: protectedProcedure.input(listBankQuestionsInput).query(async ({ input }) => {
      const conditions = [eq(schema.questionBank.active, true)];
      if (input.track) conditions.push(eq(schema.questionBank.track, input.track));
      const rows = await db.select().from(schema.questionBank).where(and(...conditions));
      const filtered = input.skillTag ? rows.filter((r) => (r.skillTags as string[]).includes(input.skillTag!)) : rows;
      return filtered.map(toBankQuestion);
    }),
  }),

  create: protectedProcedure.input(createAssessmentInput).mutation(async ({ ctx, input }) => {
    const questionRows = await db
      .select({ id: schema.questionBank.id })
      .from(schema.questionBank)
      .where(inArray(schema.questionBank.id, input.questionIds));
    if (questionRows.length !== input.questionIds.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "One or more question ids don't exist." });
    }
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

  startSession: protectedProcedure.input(startSessionInput).mutation(async ({ ctx, input }) => {
    const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, input.assessmentId)).limit(1);
    if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });

    const [existing] = await db
      .select()
      .from(schema.assessmentSessions)
      .where(
        and(
          eq(schema.assessmentSessions.userId, ctx.user.sub),
          eq(schema.assessmentSessions.assessmentId, assessment.id),
          eq(schema.assessmentSessions.status, "active"),
        ),
      )
      .limit(1);
    if (existing) {
      if (existing.expiresAt > new Date()) {
        const result: StartSessionResult = { sessionId: existing.id, resumed: true };
        return result;
      }
      await db
        .update(schema.assessmentSessions)
        .set({ status: "expired" })
        .where(eq(schema.assessmentSessions.id, existing.id));
    }

    const durationMs = (assessment.timeLimitSeconds ?? SESSION_MINUTES * 60) * 1000;
    const [session] = await db
      .insert(schema.assessmentSessions)
      .values({ assessmentId: assessment.id, userId: ctx.user.sub, expiresAt: new Date(Date.now() + durationMs) })
      .returning();
    if (!session) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const result: StartSessionResult = { sessionId: session.id, resumed: false };
    return result;
  }),

  getNextQuestion: protectedProcedure.input(getNextQuestionInput).query(async ({ ctx, input }) => {
    const session = await requireOwnActiveSession(input.sessionId, ctx.user.sub);
    const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, session.assessmentId)).limit(1);
    if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });

    const questionIds = assessment.questionIds as string[];
    const qid = questionIds[input.index];
    if (!qid) {
      const result: NextQuestionResult = { done: true, total: questionIds.length };
      return result;
    }

    const [q] = await db.select().from(schema.questionBank).where(eq(schema.questionBank.id, qid)).limit(1);
    if (!q) throw new TRPCError({ code: "NOT_FOUND" });

    const result: NextQuestionResult = {
      done: false,
      total: questionIds.length,
      index: input.index,
      question: {
        id: q.id,
        kind: q.kind as QuestionKind,
        prompt: q.prompt,
        payload: toSafePayload(q.kind as QuestionKind, q.payload),
      },
      expiresAt: session.expiresAt.toISOString(),
    };
    return result;
  }),

  submitAnswer: protectedProcedure.input(submitAnswerInput).mutation(async ({ ctx, input }) => {
    const session = await requireOwnActiveSession(input.sessionId, ctx.user.sub);
    const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, session.assessmentId)).limit(1);
    if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });
    if (!(assessment.questionIds as string[]).includes(input.questionId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Question not in this session." });
    }
    const [q] = await db.select().from(schema.questionBank).where(eq(schema.questionBank.id, input.questionId)).limit(1);
    if (!q) throw new TRPCError({ code: "NOT_FOUND" });

    const kind = q.kind as QuestionKind;

    // Upsert on the (sessionId, questionId) unique constraint — atomic, so two
    // concurrent submitAnswer calls for the same question can't race into a
    // duplicate-key error the way a manual select-then-insert-or-update would.
    async function upsertAnswer(fields: {
      correct: boolean | null;
      scoreFraction: number | null;
      gradedAt: Date | null;
    }): Promise<string> {
      const [row] = await db
        .insert(schema.answers)
        .values({ sessionId: input.sessionId, questionId: input.questionId, response: input.response, ...fields })
        .onConflictDoUpdate({
          target: [schema.answers.sessionId, schema.answers.questionId],
          set: { response: input.response, ...fields },
        })
        .returning({ id: schema.answers.id });
      return row!.id;
    }

    if (isAsyncGraded(kind)) {
      if (usingCodeGradingStub) {
        // No JUDGE0_URL — grade synchronously via the keyword-rubric stub so
        // local dev without Docker's Judge0 profile still works end-to-end.
        const fraction = gradeCodeStub(q.payload as { keywords: string[] }, input.response.source ?? "");
        await upsertAnswer({ correct: fraction === 1, scoreFraction: fraction, gradedAt: new Date() });
        emitSessionAnswerGraded(input.sessionId, { questionId: input.questionId, scoreFraction: fraction });
        return { ok: true, pending: false };
      }

      // Real Judge0 configured — save the response ungraded and enqueue.
      const answerId = await upsertAnswer({ correct: null, scoreFraction: null, gradedAt: null });
      await tryEnqueue(
        getQueues().gradeCode.add("grade", { answerId, sessionId: input.sessionId }),
        `grade-code (answer ${answerId})`,
      );
      return { ok: true, pending: true };
    }

    // Sync-gradable kinds.
    const result = gradeSyncAnswer(kind, q.payload, input.response);
    if (!result) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await upsertAnswer({ correct: result.correct, scoreFraction: result.scoreFraction, gradedAt: new Date() });
    emitSessionAnswerGraded(input.sessionId, { questionId: input.questionId, scoreFraction: result.scoreFraction });
    return { ok: true, pending: false };
  }),

  recordTelemetry: protectedProcedure.input(recordTelemetryInput).mutation(async ({ ctx, input }) => {
    const session = await requireOwnActiveSession(input.sessionId, ctx.user.sub);
    const telemetry = { ...(session.telemetry as Record<string, number>) };
    telemetry[input.event] = (telemetry[input.event] ?? 0) + 1;
    await db.update(schema.assessmentSessions).set({ telemetry }).where(eq(schema.assessmentSessions.id, session.id));

    if ((input.event === "blur" || input.event === "paste") && telemetry[input.event]! >= INTEGRITY_FLAG_THRESHOLD) {
      emitIntegrityFlag(session.assessmentId, {
        sessionId: session.id,
        userId: ctx.user.sub,
        event: input.event,
        count: telemetry[input.event]!,
      });
    }
    return { ok: true };
  }),

  submitSession: protectedProcedure.input(submitSessionInput).mutation(async ({ ctx, input }) => {
    const session = await requireOwnActiveSession(input.sessionId, ctx.user.sub);
    const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, session.assessmentId)).limit(1);
    if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });

    const questionRows = await db
      .select()
      .from(schema.questionBank)
      .where(inArray(schema.questionBank.id, assessment.questionIds as string[]));
    const kindById = new Map(questionRows.map((q) => [q.id, q.kind as QuestionKind]));

    const answerRows = await db.select().from(schema.answers).where(eq(schema.answers.sessionId, session.id));
    const graded = answerRows.filter((a) => a.gradedAt !== null);
    const pending = answerRows.some((a) => a.gradedAt === null);

    const rawScore = computeRawScore(graded.map((a) => ({ kind: kindById.get(a.questionId)!, scoreFraction: a.scoreFraction ?? 0 })));

    const cohort = await db
      .select({ rawScore: schema.trackResults.rawScore })
      .from(schema.trackResults)
      .where(and(eq(schema.trackResults.track, assessment.track), ne(schema.trackResults.userId, ctx.user.sub)));
    const percentile = percentileOf(rawScore, cohort.map((c) => c.rawScore));

    await db
      .update(schema.assessmentSessions)
      .set({ status: pending ? "submitted" : "graded", submittedAt: new Date() })
      .where(eq(schema.assessmentSessions.id, session.id));
    await db
      .insert(schema.trackResults)
      .values({ userId: ctx.user.sub, sessionId: session.id, track: assessment.track, rawScore, percentile });

    if (!pending) emitSessionGraded(session.id, { rawScore, percentile });

    const result: SubmitSessionResult = { rawScore, percentile, pending };
    return result;
  }),

  myHistory: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        sessionId: schema.trackResults.sessionId,
        assessmentId: schema.assessmentSessions.assessmentId,
        track: schema.trackResults.track,
        rawScore: schema.trackResults.rawScore,
        percentile: schema.trackResults.percentile,
        earnedAt: schema.trackResults.earnedAt,
      })
      .from(schema.trackResults)
      .innerJoin(schema.assessmentSessions, eq(schema.assessmentSessions.id, schema.trackResults.sessionId))
      .where(eq(schema.trackResults.userId, ctx.user.sub))
      .orderBy(desc(schema.trackResults.earnedAt));

    return Promise.all(
      rows.map(async (r): Promise<TrackResultHistoryItem> => {
        const [assessment] = await db
          .select({ title: schema.assessments.title })
          .from(schema.assessments)
          .where(eq(schema.assessments.id, r.assessmentId))
          .limit(1);
        return {
          sessionId: r.sessionId,
          assessmentId: r.assessmentId,
          assessmentTitle: assessment?.title ?? "",
          track: r.track as TrackResultHistoryItem["track"],
          rawScore: r.rawScore,
          percentile: r.percentile,
          earnedAt: r.earnedAt.toISOString(),
        };
      }),
    );
  }),
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w apps/api`
Expected: PASS. If `usingCodeGradingStub` isn't already exported from `apps/api/src/lib/env.js`, add `export const usingCodeGradingStub = !env.JUDGE0_URL;` there (it already exists per `apps/api/src/lib/env.ts:39` — just confirm the import resolves).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routers/assessments.ts
git commit -m "feat(api): rewrite assessments router for question-bank + session model"
```

---

### Task 10: Worker entrypoint

**Files:**
- Create: `apps/api/src/worker.ts`

**Interfaces:**
- Consumes: `./lib/queue.js` (Task 5), `./lib/judge0.js` (Task 6), `./lib/db.js`, `./lib/realtime.js` (Task 8), `@trafy-community/core`'s `computeRawScore`/`percentileOf`, `@trafy-community/db`'s `schema`.
- Produces: a runnable process via `npm run worker -w apps/api` (script added in Task 1).

This ports the `grade-code` worker from `d:\downloads\trafy\api\src\workers\index.ts`, dropping `mail-lifecycle`/`workspace-reaper` (not relevant here) and adapting table/column names to this repo's schema.

- [ ] **Step 1: Write `apps/api/src/worker.ts`**

```ts
/**
 * Background worker — run as a separate process: npm run worker -w apps/api
 * (or `npm run dev:worker` from the repo root).
 *
 * Only receives jobs when JUDGE0_URL is set — submitAnswer grades code
 * synchronously via the keyword stub and never enqueues when it isn't (see
 * apps/api/src/routers/assessments.ts).
 */
import { Worker } from "bullmq";
import { and, eq, inArray, ne } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import { computeRawScore, percentileOf, type QuestionKind } from "@trafy-community/core";
import { db } from "./lib/db.js";
import { queueConnection, type GradeCodeJob } from "./lib/queue.js";
import { gradeSubmission, type TestCase } from "./lib/judge0.js";
import { emitSessionAnswerGraded, emitSessionGraded } from "./lib/realtime.js";

const connection = queueConnection();

const gradeWorker = new Worker<GradeCodeJob>(
  "grade-code",
  async (job) => {
    const { answerId, sessionId } = job.data;
    const [answer] = await db.select().from(schema.answers).where(eq(schema.answers.id, answerId)).limit(1);
    if (!answer) return;
    const [question] = await db.select().from(schema.questionBank).where(eq(schema.questionBank.id, answer.questionId)).limit(1);
    if (!question || question.kind !== "code") return;

    const payload = question.payload as { hiddenTestCases: TestCase[]; language: string };
    const response = answer.response as { source?: string };

    const { scoreFraction } = await gradeSubmission(response.source ?? "", payload.language, payload.hiddenTestCases ?? []);

    await db
      .update(schema.answers)
      .set({ scoreFraction, correct: scoreFraction === 1, gradedAt: new Date() })
      .where(eq(schema.answers.id, answerId));
    emitSessionAnswerGraded(sessionId, { questionId: answer.questionId, scoreFraction });

    // Once every answer in the session is graded, refresh the track result
    // and finalize the session status.
    const sessionAnswers = await db.select().from(schema.answers).where(eq(schema.answers.sessionId, sessionId));
    if (sessionAnswers.some((a) => a.gradedAt === null)) return;

    const [session] = await db.select().from(schema.assessmentSessions).where(eq(schema.assessmentSessions.id, sessionId)).limit(1);
    if (!session) return;
    const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, session.assessmentId)).limit(1);
    if (!assessment) return;

    const sessionQuestions = await db
      .select({ id: schema.questionBank.id, kind: schema.questionBank.kind })
      .from(schema.questionBank)
      .where(inArray(schema.questionBank.id, sessionAnswers.map((a) => a.questionId)));
    const kindById = new Map<string, QuestionKind>(sessionQuestions.map((q) => [q.id, q.kind as QuestionKind]));

    const rawScore = computeRawScore(
      sessionAnswers.map((a) => ({ kind: kindById.get(a.questionId)!, scoreFraction: a.scoreFraction ?? 0 })),
    );

    const cohort = await db
      .select({ rawScore: schema.trackResults.rawScore })
      .from(schema.trackResults)
      .where(and(eq(schema.trackResults.track, assessment.track), ne(schema.trackResults.userId, session.userId)));
    const percentile = percentileOf(rawScore, cohort.map((c) => c.rawScore));

    await db.update(schema.trackResults).set({ rawScore, percentile }).where(eq(schema.trackResults.sessionId, sessionId));
    await db.update(schema.assessmentSessions).set({ status: "graded" }).where(eq(schema.assessmentSessions.id, sessionId));
    emitSessionGraded(sessionId, { rawScore, percentile });
  },
  { connection, concurrency: 4 },
);

console.log("Worker up: grade-code");

async function shutdown() {
  await gradeWorker.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w apps/api`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/worker.ts
git commit -m "feat(api): add grade-code worker (Judge0 execution + session finalization)"
```

---

### Task 11: Integration tests for the session flow

**Files:**
- Create: `apps/api/test/assessments.integration.test.ts`

**Interfaces:**
- Consumes: `appRouter` (`../src/routers/index.js`), `db` (`../src/lib/db.js`), `schema` (`@trafy-community/db`).

**Scope decision (explicit, not a silent gap):** this covers the two paths that don't need Redis or a live Judge0 instance — (1) the full MCQ session flow (create → start → answer → submit → `track_results`/percentile), and (2) the code-answer dev-stub fallback path (`usingCodeGradingStub`). It does **not** cover the real Judge0-queued path (would require mocking BullMQ's `Queue.add` and a Judge0 HTTP response) — that's a reasonable fast-follow once a real `JUDGE0_URL` exists to test against, not required to validate the score model itself. Requires Postgres running (`docker compose up -d` from repo root) with migrations applied (Task 4's migration must be run first: `npm run db:migrate -w packages/db`).

- [ ] **Step 1: Write the test**

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import { db } from "../src/lib/db";
import { appRouter } from "../src/routers/index";

function callerFor(userId: string) {
  return appRouter.createCaller({ user: { sub: userId }, req: {} as never, res: {} as never });
}

describe("assessments session flow", () => {
  let userId: string;
  let questionId: string;
  let codeQuestionId: string;
  let assessmentId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(schema.users)
      .values({ email: `assess-test-${Date.now()}@example.com` })
      .returning();
    userId = user!.id;

    const caller = callerFor(userId);
    const q = await caller.assessments.bank.create({
      kind: "single_choice",
      track: "python",
      skillTags: ["basics"],
      difficulty: 1,
      prompt: "What does len([1,2,3]) return?",
      payload: { options: ["2", "3", "4"], correctIndex: 1 },
    });
    questionId = q.id;

    const codeQ = await caller.assessments.bank.create({
      kind: "code",
      track: "python",
      skillTags: ["basics"],
      difficulty: 1,
      prompt: "Write a function that returns its argument doubled.",
      payload: { language: "python", starterCode: "def double(x):\n    pass", hiddenTestCases: [], keywords: ["return", "def"] },
    });
    codeQuestionId = codeQ.id;

    const assessment = await caller.assessments.create({
      title: "Python basics",
      track: "python",
      layer: 1,
      questionIds: [questionId, codeQuestionId],
    });
    assessmentId = assessment.id;
  });

  afterAll(async () => {
    await db.delete(schema.answers).where(eq(schema.answers.questionId, questionId));
    await db.delete(schema.answers).where(eq(schema.answers.questionId, codeQuestionId));
    await db.delete(schema.trackResults).where(eq(schema.trackResults.userId, userId));
    await db.delete(schema.assessmentSessions).where(eq(schema.assessmentSessions.userId, userId));
    await db.delete(schema.assessments).where(eq(schema.assessments.id, assessmentId));
    await db.delete(schema.questionBank).where(eq(schema.questionBank.id, questionId));
    await db.delete(schema.questionBank).where(eq(schema.questionBank.id, codeQuestionId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  });

  it("grades an MCQ session synchronously and records a track result", async () => {
    const caller = callerFor(userId);
    const { sessionId } = await caller.assessments.startSession({ assessmentId });

    const first = await caller.assessments.getNextQuestion({ sessionId, index: 0 });
    expect(first.done).toBe(false);
    if (first.done) throw new Error("unreachable");
    await caller.assessments.submitAnswer({
      sessionId,
      questionId: first.question.id,
      response: { selectedIndex: 1 },
    });

    const second = await caller.assessments.getNextQuestion({ sessionId, index: 1 });
    expect(second.done).toBe(false);
    if (second.done) throw new Error("unreachable");
    // Code question, no JUDGE0_URL in test env -> grades synchronously via the stub.
    await caller.assessments.submitAnswer({
      sessionId,
      questionId: second.question.id,
      response: { source: "def double(x):\n    return x * 2" },
    });

    const result = await caller.assessments.submitSession({ sessionId });
    expect(result.pending).toBe(false);
    expect(result.rawScore).toBeGreaterThan(0);

    const history = await caller.assessments.myHistory();
    expect(history.some((h) => h.sessionId === sessionId)).toBe(true);

    const [trackResult] = await db.select().from(schema.trackResults).where(eq(schema.trackResults.sessionId, sessionId));
    expect(trackResult).toBeDefined();
    expect(trackResult!.percentile).toBe(50); // empty cohort -> neutral 50
  });
});
```

- [ ] **Step 2: Run test to verify it fails first (if Postgres isn't running)**

Run: `docker compose up -d` (from `trafy-community/` root, starts Postgres + Redis), then `npm run db:migrate -w packages/db`.
Then run: `npm test -w apps/api`
Expected: initially FAIL if migrations haven't been applied yet (`relation "question_bank" does not exist"`) — apply migrations, then re-run.

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test -w apps/api`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/assessments.integration.test.ts
git commit -m "test(api): add integration test for the assessment session flow"
```

---

### Task 12: Final workspace verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck` (from repo root — runs core, db, api, web, mobile in sequence per the root `package.json` script).
Expected: `apps/web` and `apps/mobile` will show errors in their `assess/**` pages — this is the known, accepted breakage from the spec's "Testing" section (tracked separately, not fixed by this plan). Confirm the errors are confined to those directories and nothing else broke.

- [ ] **Step 2: Full test run**

Run: `npm test -w packages/core && npm test -w apps/api`
Expected: all PASS.

- [ ] **Step 3: Confirm nothing outside the expected blast radius changed**

Run: `git status`
Expected: only files touched in Tasks 1-11, plus the two spec files from before this plan. No changes under `apps/web`, `apps/mobile`, or unrelated routers.
