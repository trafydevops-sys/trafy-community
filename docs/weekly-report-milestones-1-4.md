# Trafy Community — Weekly Work Report
**Reporting period:** July 11 – July 13, 2026
**Scope:** Milestones 1–4 (Identity → Community Shell → Learning Hub → Groups & Assessments)
**Repository:** `trafy-community/` (standalone build, intentionally decoupled from the existing `trafy/` marketing/talent-platform codebase)

---

## 1. Summary

This week the Trafy Community platform was built from an empty repository up
through four complete milestones: account identity, a social community shell,
a full Learning Hub with monetization, and a study-groups + assessment engine.
The codebase is a working, typechecked, buildable monorepo — not a mockup —
with a real Postgres schema (8 migrations, 22 tables), a typed API surface
(12 tRPC routers), and a Next.js frontend covering every flow end to end.

Every external dependency (email delivery, file storage, payments) is
**env-gated with an honest fallback**: the app runs and is fully demoable with
zero third-party accounts configured, and swapping in a real provider later is
a config change, not a rewrite.

---

## 2. Milestone-by-milestone breakdown

### Milestone 1 — Identity *(done)*

The foundation everything else sits on.

- **Monorepo scaffold**: npm workspaces (`apps/*`, `packages/*`), Docker
  Compose for local Postgres 16 + Redis, CI config, shared `tsconfig.base.json`.
- **Auth**: email + OTP (one-time code) sign-in, not passwords. Codes are
  rate-limited via Redis. JWT access tokens (15-minute expiry) paired with a
  rotating opaque refresh token stored **hashed** in Postgres
  (`refresh_tokens` table) — a stolen refresh token in the database is useless
  without the plaintext value.
- **Profile Creation wizard**: multi-step profile setup (name, title, bio,
  education, experience) backed by a dedicated `profiles` table, plus a
  `privacy_settings` table so users control what's visible.
- **Certificate uploads**: file upload flow with the storage backend already
  abstracted behind a `storage.ts` interface — local disk today, an
  S3-compatible client is a one-file swap when `S3_ENDPOINT` is set.
- **Dev-mode email**: with no `RESEND_API_KEY`, OTP codes print to the API
  console **and** render directly on the sign-up page (a dev-code banner), so
  the whole auth loop is testable with zero email provider setup.

### Milestone 2 — Community Shell *(done)*

The social graph and realtime layer.

- **Home feed**: chronological post feed with likes (`post_reactions`) and
  follows (`follows`), cursor-paginated at the API layer.
- **Discover**: full-text search across people, powered by native **Postgres
  full-text search** — a GIN index over a `to_tsvector` expression on
  name/title/bio, not a bolted-on search service.
- **Realtime chat**: Socket.IO attached to the same Fastify HTTP server, with
  a **JWT-authenticated handshake** (no anonymous socket connections). Covers
  1:1 DMs and multi-member group channels (`chat_channels`,
  `chat_channel_members`, `chat_messages`).
- **Live notifications**: a `notifications` table plus a live socket channel
  per user (`user:{id}`) so likes, follows, and messages surface instantly
  without polling.

### Milestone 3 — Learning Hub *(done)*

Course creation, monetization, and consumption.

- **Course builder**: courses → modules → lessons, with three lesson types
  (video, text, live). Any lesson can be flagged as a free **sample** so it
  previews even inside a paid course.
- **Public catalog + enrollment**: browsing, per-lesson progress tracking
  (`lesson_progress`), and a **completion signal**
  (`enrollments.completedAt`) recomputed every time a lesson is
  checked/unchecked — finishing the last lesson sets it, un-checking any
  lesson clears it again.
- **Checkout**: a `payments` table and a `payments.checkout` procedure that
  marks a paid course "paid" instantly. This is **explicitly a stub** — no
  Razorpay/Stripe session, no webhook, no card details collected anywhere —
  and the API response carries a `stub: true` flag specifically so the UI can
  show a "test payment" banner and nobody mistakes it for a live charge. The
  seam for a real gateway is a single file (`payments.ts`).
- **Creator payouts**: an 80/20 creator/platform revenue split, computed from
  `payments` and allocated into `payouts` batches on request. Payouts are
  **computed, not disbursed** — a payout row reaches `pending` and stops
  there; there's no bank transfer or Stripe/Razorpay Connect call yet.
- **Course reviews** *(carried in from later scope, already live)*: a learner
  can leave a 1–5 star rating once every lesson is completed; one review per
  learner per course (re-submitting upserts, not duplicates); average
  rating/count surfaces on the catalog.

### Milestone 4 — Groups & Assessments *(done)*

The two features this milestone specifically adds.

- **Study groups**: a `study_groups` table where every group is backed by its
  own `chat_channels` row — joining a group drops you straight into its group
  chat. Groups are discoverable and joinable, not invite-only.
- **Assessment engine** — the core deliverable of this milestone:
  - **Authoring**: an author builds a question bank per assessment
    (`assessment_questions`) supporting **four question kinds** — single
    choice, multiple choice, short answer, and code — each with its own
    `points` weight and ordering.
  - **Answer-key isolation**: `answerKey` is stored in the same row as the
    question but is **stripped server-side before the question is served** to
    a test-taker — a candidate never receives the key over the wire, only the
    prompt and options.
  - **Timed runner**: `assessment_attempts` records a start time and enforces
    `timeLimitSeconds` from the assessment config; `attempt_answers` records
    each response.
  - **Auto-grading**: choice and short-answer questions grade
    deterministically and are final the moment they're submitted. Code
    questions grade against a **keyword rubric** (case-insensitive substring
    match against the author's expected keywords) when no `JUDGE0_URL` is
    configured — the same env-gated pattern as email and storage. The
    execution-grading seam (`apps/api/src/lib/grading.ts`) is already isolated
    so swapping in real sandboxed execution later doesn't touch the rest of
    the pipeline.
  - **Passing score**: each assessment defines its own `passingScore`
    (default 60%), evaluated against the weighted point total across
    all answered questions.

---

## 3. What's verifiably working (not just described)

| Check | Result |
| --- | --- |
| `npm run typecheck` (5 workspaces: core, db, api, web + mobile scaffold) | clean |
| `npm run build` (core → db → api → web) | succeeds |
| Local quickstart (docker compose → migrate → dev:api → dev:web) | full auth → feed → course → group → assessment loop walkable end to end with two accounts |
| Migrations | 8 sequential Drizzle migrations, applied cleanly against Postgres 16 |
| Schema | 22 tables covering identity, social graph, chat, learning, groups, and assessments (jobs/contracts tables exist in schema ahead of Milestone 5 but aren't the subject of this report) |

---

## 4. Explicit non-scope / known simplifications (through Milestone 4)

Reported transparently rather than glossed over, per the project's own
"Known simplifications" convention:

- **Checkout and payouts are stubs.** No real money moves. This is a
  deliberate, env-gated placeholder — see Milestone 3 above.
- **Token storage**: the web client keeps the access/refresh pair in
  `localStorage` for now; moving the refresh token to an httpOnly cookie is
  flagged as pre-production work.
- **No react-query bindings**: web calls a vanilla `@trpc/client` instance
  directly rather than `@trpc/react-query`, sidestepping React 19
  peer-dependency churn. Fine through this milestone's polling+socket
  pattern; flagged to revisit if cache-invalidation logic grows.
- **Feed is chronological only** — no ranking algorithm yet (out of scope
  for Milestone 2).
- **Code-question grading is a keyword rubric, not execution** until
  `JUDGE0_URL` is configured (see Milestone 4 above) — flagged clearly in
  the UI/docs so it's never mistaken for real sandboxed grading.
- **Assessment attempt state is client-held**: the served question set is
  stashed in `sessionStorage`; reloading the runner tab loses the in-progress
  attempt (the graded result itself is always persisted server-side, and
  retakes are unlimited).

---

## 5. Next up (Milestone 5 and beyond)

Per the roadmap, the immediate next milestone is the **Hiring marketplace**
(recruiter job listings + Kanban pipeline, talent apply flow, contracts +
escrow payments) — schema for `jobs`, `applications`, `contracts`, and
`contract_milestones` already exists in the current migrations, ready for
the API/UI layer to build against next week.
