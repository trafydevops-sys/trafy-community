# Assessment Foundation: Trafy Points, Question Bank, Real Judge0 (Phase 0)

## Context

`trafy-community`'s current assessment system (`assessments` / `assessment_questions`
/ `assessment_attempts` / `attempt_answers`) is a one-off pass/fail-percent model with
stub code grading (keyword matching, see `apps/api/src/lib/grading.ts`).

A separate, already-built codebase — `trafy-platform` at the repo root (`d:\downloads\trafy\`,
outside `trafy-community/`) — implements a more mature model: a reusable question bank,
streamed sessions with integrity telemetry, real Judge0 execution via BullMQ workers, and
**Trafy Points**: a cohort-percentile-per-track score that decays linearly (months 12–18)
and composites across tracks by rank-weighting (`packages/core/src/scoring.ts`,
`matching.ts`, `packages/db/src/schema.ts` in that repo).

This spec replaces `trafy-community`'s assessment foundation with that model, adapted to
this repo's conventions. It is Phase 0 of the 4-layer assessment platform — Layers 2–4 and
the recruiter console are separate, later specs that build on this.

**Blast radius check:** only `apps/api/src/routers/assessments.ts` and
`apps/api/src/routers/index.ts` reference the current assessment tables — no other router
(`groups.ts`, `jobs.ts`, etc.) touches them. A clean cutover is safe.

**Data note:** this environment only has local dev/demo data (Docker Postgres). The
migration drops and recreates the assessment tables rather than preserving old rows —
confirm before running against any environment with real data.

## Architecture

```
Candidate/Recruiter
   │
   ▼
tRPC assessments router  ──►  Postgres (questionBank, assessments, assessmentSessions,
   │                                     answers, trackResults)
   │  (code answer submitted)
   ▼
BullMQ queue (Redis, already running)
   │
   ▼
Judge0 worker (new: apps/api/src/worker.ts)  ──►  Judge0 HTTP API (JUDGE0_URL)
   │
   ▼
writes answers.scoreFraction/correct, then on last-answer-graded:
   computes trackResults row (rawScore, percentile vs cohort) via packages/core scoring.ts
   │
   ▼
Socket.IO (existing apps/api/src/lib/realtime.ts) emits session:graded / integrity:flag
```

## Score scale (resolved ambiguity)

`computeTrafyPoints` and `track_results.percentile` are both 0–100 (percentile-based,
verbatim from trafy-platform's `scoring.ts`). The vision doc's illustrative
`"AI Engineer ≥ 650 to apply"` phrasing does **not** map onto this scale — there is no
0–850 (or similar) conversion. Score gates, recruiter filters, and profile display all use
the native 0–100 number as-is (e.g. "≥ 75 Trafy Points" / "≥ 75th percentile"), decided here
rather than left for a later spec to rediscover.

## Data model

Replaces `assessments`, `assessment_questions`, `assessment_attempts`, `attempt_answers`
in `packages/db/src/schema.ts`. Follows this repo's existing convention (plain `text()`
columns with a comment listing the union, validated in Zod — **not** `pgEnum`, unlike
trafy-platform's schema, to stay consistent with every other table in this file).

- **`question_bank`** — the curated pool. Consolidates trafy-platform's `questions` table
  with the skill-tagging this repo's Layer 2 design already needs, so there's one bank, not
  two.
  `id, externalId (nullable unique), track (text — 'python'|'ml-engineering'|
  'llm-engineering'|'data-engineering'|'frontend'|'backend'|'devops', fixed list in
  @trafy-community/core), skillTags (jsonb string[] — fine-grained tags like "rag",
  "transformers", used by Layer 2's JD matching), kind (text — same 4 kinds as today),
  difficulty (int 1-5), prompt, payload (jsonb — kind-specific: options+correctIndex,
  options+correctIndices, acceptable[], or language+starterCode+hiddenTestCases for code),
  active (bool), authorId, createdAt, updatedAt`.

- **`assessments`** — a persisted, reusable *definition*: specific question IDs snapshotted
  from the bank at assembly time (so later bank edits never change a test someone already
  took — same integrity guarantee as today).
  `id, title, track, layer (int — 1 or 2, Layer 3/4 don't use this table), timeLimitSeconds,
  questionIds (jsonb string[]), jobId (nullable FK — set for Layer 2 tests), authorId,
  createdAt`.

- **`assessment_sessions`** — one per candidate attempt. Questions are streamed one at a
  time server-side (never send the full set to the client — matches trafy-platform's
  integrity model).
  `id, assessmentId (FK), userId, status (text — 'active'|'submitted'|'graded'|'expired'),
  startedAt, expiresAt, submittedAt, telemetry (jsonb — { tabBlurCount, pasteCount,
  fullscreenExitCount }, default {})`.

- **`answers`** — `id, sessionId (FK), questionId (FK to question_bank), response (jsonb),
  correct (bool, nullable), scoreFraction (real, nullable — partial credit for code),
  gradedAt (nullable)`.

- **`track_results`** — the source of truth for Trafy Points. One row per graded session.
  `id, userId, sessionId (FK), track, rawScore (real, 0-1), percentile (real, 0-100 —
  computed against the cohort of other rawScores in the same track at grading time),
  earnedAt`.

## Scoring engine (port, verbatim logic)

New file `packages/core/src/scoring.ts` in `trafy-community`, porting trafy-platform's
functions unchanged (they're pure, already tested, no DB dependency):

- `decayFactor(earnedAt, now)` — 1.0 until month 12, linear to 0 by month 18.
- `decayedScore(result, now)` — `percentile * decayFactor(...)`.
- `computeTrafyPoints(results, now)` — best decayed score per track, then rank-weighted
  mean (weights `1, 1/2, 1/3, ...` over tracks sorted descending) — depth beats breadth.
- `percentileOf(raw, cohort)` — inclusive-rank percentile of a raw score within a cohort.

Cohort for percentile calc at grading time = all `track_results.rawScore` for the same
`track`, queried fresh each time a session grades (small dataset at MVP scale; revisit with
a materialized cohort snapshot only if this becomes a real query-cost problem).

## Judge0 grading

`JUDGE0_URL` already exists as an optional env var (`apps/api/src/lib/env.ts:18`) but the
seam was never implemented — `gradeCodeStub` is a keyword-match placeholder. This phase
implements it for real:

1. New dependency: `bullmq` (Redis already running, reuse `apps/api/src/lib/redis.ts`'s
   connection).
2. New worker entrypoint `apps/api/src/worker.ts` (mirrors trafy-platform's
   `npm run worker -w api` pattern) — add a `worker` script to `apps/api/package.json` and
   a root `dev:worker` script.
3. On code-answer submit: MCQ/short-answer grade synchronously as today; a `code` answer
   instead enqueues a `grade-code` job (`{ answerId, questionId, response }`) and the
   session stays in a "grading" sub-state.
4. Worker: submits source + hidden test cases (from `question_bank.payload`) to Judge0,
   polls for result, writes `answers.scoreFraction`/`correct`.
5. When the last pending answer for a session is graded, the worker finalizes the session:
   aggregates `rawScore`, computes `percentile` via `percentileOf` against the track
   cohort, inserts the `track_results` row, sets `assessment_sessions.status = 'graded'`.
6. `usingCodeGradingStub` stays as the honesty-rule flag (`!env.JUDGE0_URL`) — with no
   `JUDGE0_URL`, code answers grade via the existing keyword stub synchronously (no queue),
   so local dev without Docker's Judge0 profile still works end-to-end.

## Real-time (live grading + integrity feed)

Uses the existing Socket.IO gateway (`apps/api/src/lib/realtime.ts`) — no new transport.

- Candidate's client joins room `session:{sessionId}` on session start.
- MCQ/short-answer: server emits `session:answer-graded` immediately (synchronous).
- Code answers: worker emits `session:answer-graded` on Judge0 result; `session:graded`
  with the full `track_results` payload when the session finalizes.
- Recruiter/proctor view (used properly once the Layer-2 console exists, but the events
  exist now): joins `assessment:{assessmentId}:live`; server emits `integrity:flag`
  whenever a telemetry mutation reports a tab-blur/paste event during an active session,
  with a lightweight threshold (e.g. flag on 3rd+ tab-blur) to avoid noise.

## API surface (rewritten `assessments.ts`)

- `bank.create` / `bank.list` (filter by track/skillTags) / `bank.update` — any signed-in
  user, same permission model as today's assessment authoring.
- `create` — assembles an `assessments` row from a list of bank question IDs (used
  directly for Layer 1 authoring; Layer 2's JD-flow calls this too once its own spec is
  built).
- `startSession` — picks/streams questions server-side, creates `assessment_sessions` row.
- `getNextQuestion` / `recordTelemetry` — streaming + integrity ping endpoints.
- `submitAnswer` — grades sync (MCQ/short-answer) or enqueues (code).
- `submitSession` — marks submitted, finalizes if nothing pending.
- `myHistory` — replaces `attemptHistoryItemSchema`, returns `track_results` rows.

## Error handling

- Judge0 unreachable/timeout: job fails, BullMQ's built-in retry (3 attempts, backoff)
  kicks in; after exhaustion, `answers.scoreFraction` stays null and the session surfaces
  a clear "grading delayed" state rather than hanging — never silently drops a submission.
- Percentile query with an empty cohort (first-ever result for a track): `percentileOf`
  already handles `cohort.length === 0` → returns 50 (matches trafy-platform's existing
  behavior).

## Testing

- Port trafy-platform's existing Vitest suite for `scoring.ts` (decay boundaries,
  rank-weighting, percentile edge cases) unchanged.
- Integration test: seed `question_bank` → `create` assessment → `startSession` →
  `submitAnswer` for MCQ (sync grade) and code (mock Judge0 client, assert queued) →
  `submitSession` → verify `track_results` row and percentile given a seeded cohort.
- Existing web (`apps/web/src/app/assess/**`) and mobile (`apps/mobile/app/(tabs)/assess/**`)
  pages call the old router shape and **will break** — updating them to the new
  `startSession`/`submitAnswer` API is required follow-up work, tracked separately, not
  covered by this spec.

## Out of scope here (later specs)

Layer 2 JD-assembly UI, Layer 3 missions, Layer 4 AI viva, integrity beyond
tab-blur/paste (webcam, plagiarism), recruiter console.
