# Trafy Community

Community-based learning and hiring platform. This is a **standalone build**,
started from scratch inside the existing `trafy/` folder but deliberately not
wired to any of its sibling projects (`academy/`, `app/`, `api/`, `main/`,
`packages/`, `services/`) — that integration is a later decision, not made
here.

This repo currently implements **Milestones 1-9**: repo + CI + docker-compose,
email/OTP auth with JWT sessions, the Profile Creation wizard, certificate
uploads, a home feed with posts/likes/follows, Postgres full-text search on
Discover, realtime chat (DMs + groups) over Socket.IO, live notifications,
a Learning Hub — course builder (video/text/live lessons), a public catalog
with enrollment + per-lesson progress, checkout (stubbed until a real payment
gateway is wired in), and creator earnings/payouts — **study groups**
(discoverable, joinable, each backed by its own group chat) and an
**assessment engine**: authoring a question bank (single/multi choice, short
answer, code), a timed runner that serves questions with answer keys stripped,
and auto-grading — a **hiring marketplace**: recruiters post jobs and run
a Kanban-style applicant pipeline, talent applies with a cover note, and once
someone's hired a milestone-based contract with escrow (stubbed, same pattern
as course checkout) tracks funds from "pending" through "funded" to
"released" — plus **institutions & academy**: organizations with
owner/admin/instructor roles, courses publishable under an org (any member can
author, org owners/admins can manage any of the org's courses), sample
lessons that preview free even inside a paid course, and scheduled cohorts
with optional seat capacity that a learner can pick at enrollment instead of
going self-paced — a **mobile shell**: an Expo (React Native)
app in `apps/mobile` hitting this exact same backend, with email/OTP sign-in,
tokens in Keychain/EncryptedSharedPreferences via SecureStore, a biometric
unlock gate on cold start, and Expo push token registration — and now
**mobile realtime & community**: the mobile app has real tab screens for
Feed (with an offline cache so the last-seen posts show instantly, even with
no connectivity), Chats (DMs + study-group channels, live over the same
Socket.IO gateway as web), Groups (directory, join/leave, create), and
Notifications (live badge, mark read/all-read) — and push notifications are
now genuinely end-to-end: `notify()` sends a real Expo push to every device
a user has registered, not just an in-app socket event — and now **mobile
commerce & assessments**: a Learn tab (catalog, cohort picker, a
native-feeling bottom-sheet checkout over the same stubbed `payments.checkout`
as web, lessons with progress tracking), an Assess tab (browse published
assessments, a timed runner with every question kind including a
deliberately reduced code-question UX — a plain text box, no syntax
highlighting/execution on-device), and real **live class join**: a LiveKit
integration (env-gated — no meaningful stub exists for live video, so it
fails clearly instead of pretending) mints a room-scoped join token on the
backend; web connects directly with `livekit-client`, and mobile opens that
same web room in an in-app browser rather than bundling native WebRTC
modules — plus **course reviews**: a learner can leave a 1-5 star
rating and optional comment once they've completed every lesson in a
course (completion is tracked on `enrollments.completedAt`, recomputed
each time progress is toggled), with one review per learner per course
(editing upserts rather than duplicating), an average rating/review
count on the catalog and detail views, and the same UI on both web and
mobile — and the start of a **design system migration** on web: Material
Design 3 via MUI, Inter/Roboto typography, a white/grey/black palette with
four accent colors, a mobile-first responsive nav (`AppBar`+scrollable
`Tabs` on desktop, a `Drawer` below `md`), and GEO/SEO scaffolding
(`robots.txt`, `sitemap.xml`, real OG/Twitter metadata, `llms.txt`) — so far
Auth & Onboarding (Sign in, Sign up, the profile-creation wizard) and the
Community shell (Feed, Discover, Chats, Groups, Notifications, Profile) are
now fully migrated onto MUI components, with a lighter professional/
benefit-oriented copy pass on their headings — the remaining 17 pages
(Learning Hub, Hiring marketplace, Institutions) are still on the
pre-existing hand-written CSS (see
[Known simplifications](#known-simplifications)). Everything past that is
planned but not yet built (see [Roadmap](#roadmap)).

## Stack

| Layer | Choice |
|---|---|
| Monorepo | npm workspaces |
| Web | Next.js 15 (App Router), React 19 |
| API | Fastify 5 + tRPC 10 |
| Shared types | `@trafy-community/core` — zod schemas used by both api and web |
| Database | PostgreSQL 16 via Drizzle ORM (`@trafy-community/db`) |
| Sessions | JWT access token (15m) + rotating opaque refresh token stored hashed in Postgres |
| OTP / rate limiting | Redis |
| File uploads | Local disk (`apps/api/uploads/`), behind a swappable `storage.ts` interface |
| Email | Console-logged dev stub; swaps to Resend when `RESEND_API_KEY` is set |
| Discover search | Postgres full-text search — GIN index over a `to_tsvector` expression on name/title/bio |
| Realtime | Socket.IO, attached to the same Fastify HTTP server; JWT-authenticated handshake |
| Payments | Stubbed checkout (instant "paid" on purchase) — swap in Razorpay/Stripe in `payments.ts` when a gateway key exists |
| Creator payouts | 80/20 creator/platform revenue share, computed from `payments` and allocated into `payouts` batches on request |
| Assessment grading | Deterministic for choice/short-answer; code questions graded by a keyword rubric until `JUDGE0_URL` is set (see `lib/grading.ts`) |
| Escrow | Stubbed the same way as course checkout — funding/releasing a milestone updates its status instantly, no real payment hold |
| Institutions | Organizations with owner/admin/instructor roles; a course can be created solo or under an org, with org owners/admins able to manage any of the org's courses |
| Cohort scheduling | Optional `cohorts` per course (name, start/end date, seat capacity) — a learner can pick a cohort at checkout instead of enrolling self-paced |
| Mobile | Expo SDK 57 (React Native 0.86, React 19) with `expo-router`, in `apps/mobile` — same npm workspace, same `@trafy-community/core` schemas, same tRPC backend as web |
| Mobile session storage | `expo-secure-store` (iOS Keychain / Android EncryptedSharedPreferences) instead of web's `localStorage` |
| Mobile unlock | `expo-local-authentication` gates the app behind Face ID/Touch ID/fingerprint on cold start when a session exists and the device supports it |
| Push tokens | `expo-notifications` registers an Expo push token with the API (`push.registerToken`) |
| Push delivery | `notify()` sends a real Expo push (`https://exp.host/--/api/v2/push/send`, no API key needed) to every token a user has registered, fire-and-forget so it never blocks/fails the caller; a `DeviceNotRegistered` response auto-deletes that token |
| Mobile realtime | `socket.io-client` on mobile, same handshake/room pattern as web (`user:{id}` for notifications, `channel:{id}` for chat) — see `apps/mobile/src/lib/socket.ts` |
| Mobile offline cache | The Feed tab caches its first page of posts in `@react-native-async-storage/async-storage` and shows it instantly on launch/offline, refetching in the background |
| Mobile checkout | A native-feeling bottom-sheet payment confirmation (`apps/mobile/src/components/payment-sheet.tsx`) over the exact same `payments.checkout` stub as web — real App Store/Play Store IAP wiring is Milestone 10's "IAP/store compliance" scope, not this one |
| Live classes | `livekit-server-sdk` mints a room-scoped join JWT (`live.getJoinToken`), env-gated on `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` with no fallback stub — there's no meaningful low-fidelity substitute for real-time video. Web connects directly via `livekit-client`; mobile has no native WebRTC modules, so it opens the same web room (`/live/[lessonId]`) in an in-app browser via `expo-web-browser` |
| Course reviews | 1-5 star rating + optional comment, gated on course completion (`courses.submitReview`/`deleteReview`); one row per `(courseId, userId)` via a unique constraint, so re-submitting upserts instead of duplicating. `enrollments.completedAt` is (re)computed in `courses.setProgress` every time a lesson is checked/unchecked — completing the last lesson sets it, un-checking any lesson clears it again |
| Design system (web) | MUI v9 (Material Design 3) — theme in `apps/web/src/lib/theme.ts`: Inter (headings/links, 500/600) + Roboto (body, 400) via `next/font/google`, white/grey palette with black as the CTA color (`primary`), 4 accent colors (`theme.palette.accent.{lime,blue,green,amber}`) used sparingly for badges/status, snappy (100-200ms) transition durations only — no decorative animation |
| Web nav | `AppShell` rebuilt on MUI `AppBar` + scrollable `Tabs` (desktop) collapsing to a `Drawer` below the `md` breakpoint (mobile-first) — same 13 destinations as before, now responsive |
| SEO / GEO | `app/robots.ts` + `app/sitemap.ts` (Next.js metadata routes), real Open Graph/Twitter metadata in the root layout, and a `public/llms.txt` summarizing the product for AI crawlers/agents |

Every external dependency (email, object storage, live classes) is
**env-gated** — most have a stub fallback so the app runs with zero
third-party keys; live classes are the one exception, where there's no
honest low-fidelity substitute for real video, so it just fails clearly
until configured.

## Quickstart

```bash
cp .env.example .env
docker compose up -d          # postgres:5432, redis:6379
npm install
npm run db:generate            # generate SQL migrations from the Drizzle schema
npm run db:migrate             # apply them
npm run dev:api                 # http://localhost:4000
npm run dev:web                 # http://localhost:3000 (separate terminal)
npm run dev:mobile              # starts the Expo dev server (separate terminal)
```

Visit `http://localhost:3000`, click **Sign Up**, enter any email. With no
`RESEND_API_KEY` set, the 6-digit code is printed both in the API terminal
and directly in the sign-up page (a `dev-code-banner`) — paste it in to
continue straight through onboarding, then land on the Feed. Sign up a
second account (a different email/browser profile) to try following,
liking, DMing, and realtime notifications between two users. Visit **Teach**
to create a course (add modules/lessons, publish it), then **Learn** from
the other account to enroll/buy, watch/read lessons, and check off progress.
Create a **Group** to spin up a study group with its own chat, and use
**Assess** to author a question bank, publish it, then take the timed runner
and see it auto-grade. Post a role from **Hire**, apply to it from **Jobs**
on the other account, move the application through the pipeline, create a
contract once you make an offer, then fund and release its milestones from
**Contracts**. Create an organization from **Institutions**, add your other
account as an instructor by email, then create a course under that org from
**Teach** — the org owner can manage it too, even though they didn't create
it. Mark a lesson "sample" so it previews free even in a paid course, and add
a capped cohort from the course's edit page; the other account can then pick
that cohort at enrollment time from **Learn**. Check off every lesson as the
enrolled account to mark the course complete — a "Reviews" section then
appears at the bottom of the course page letting you leave a star rating and
comment (un-checking a lesson hides it again until you finish once more).

For mobile, run `npm run dev:mobile`, then open the Expo Go app on a phone on
the **same Wi-Fi** as your dev machine and scan the QR code (or press `a`/`i`
in the terminal for an Android/iOS emulator if you have one set up). The app
auto-derives the API's LAN IP from the Expo dev server's own host, so sign-in
works without any manual configuration — set `EXPO_PUBLIC_API_URL` in `.env`
if that guess is wrong for your network. Sign in with the same OTP flow as
web (the dev code is shown right on the sign-in screen), fill in a name on
the minimal onboarding screen, then land on the **Feed** tab. Background
the app and reopen it to see the biometric lock screen (only appears if the
device has Face ID/Touch ID/fingerprint enrolled — otherwise it's skipped
automatically). From **Me**, tap "Enable push notifications" to register an
Expo push token with the API — note this needs an EAS project ID to
actually mint a token (see [Known simplifications](#known-simplifications)),
so on a fresh clone it will show a clear error instead of a token, which is
expected; the backend side of push delivery is fully real and works
regardless. Post something from **Feed** (kill your connection first to see
the cached-posts banner, then restore it and pull-to-refresh). Create a
study group from **Groups** on one device/account — it drops you straight
into that group's thread in **Chats** — then join it from a second
account and send messages back and forth to see them arrive live; liking a
post or sending a chat message also fires a live badge update and, if the
recipient enabled push, an actual push notification. From **Learn**, browse
the catalog, tap into a course, and enroll through the native-style payment
sheet (pick a cohort first if the course has one) — no card details are
ever collected, same stub as web. From **Assess**, start a published
assessment and take it — the countdown auto-submits at the time limit, and
a code question is answerable but explicitly reduced UX (plain text box, no
IDE). If you've set `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` (see
`.env.example`), tap "Join live class" on a live lesson from either Learn or
web's own Learn page to open a real video room — without those set, you'll
get a clear "not configured" message instead, which is the expected/correct
behavior on a fresh clone. Finish every lesson in a course to unlock the
same Reviews section on mobile — rate it with a tap on the stars, add an
optional comment, and it shows up (with the average rating) on both
platforms immediately.

## Project layout

```
apps/
  web/     Next.js frontend — Sign Up/In, Profile wizard, Feed, Discover, Chats, Groups, Assess, Learn, Live room, Teach, Institutions, Jobs, Hire, Contracts, Notifications, Profile
  api/     Fastify + tRPC backend — auth, profile, posts/follows, discover, chat (+ Socket.IO), notifications, courses, payments, groups, assessments, jobs, applications, contracts, organizations, push, live
  mobile/  Expo (React Native) app — sign-in (OTP), minimal onboarding, biometric lock, tabs: Feed (offline cache), Chats, Groups, Learn (+ checkout, live-join), Assess (runner), Notifications, Me
packages/
  core/    Shared zod schemas & types (auth, profile, privacy, uploads, post, follow, discover, chat, notification, course, payment, group, assessment, job, application, contract, organization, push, live)
  db/      Drizzle schema, client, migrations
```

## Known simplifications (Milestone 1 scope — revisit before shipping)

- **Token storage**: the web client keeps the access + refresh token pair in
  `localStorage`. Fine for building/demoing the auth flow; before production,
  move the refresh token to an httpOnly cookie set by the API and keep only
  the access token in memory. Mobile (`apps/mobile`) already does the more
  secure thing — SecureStore backed by Keychain/EncryptedSharedPreferences.
- **File storage**: certificates/avatars are written to local disk. Swap
  `apps/api/src/lib/storage.ts` for an S3-compatible client when `S3_ENDPOINT`
  is set — the function signature is already the seam.
- **No react-query bindings**: the web app calls a vanilla `@trpc/client`
  instance directly (see `lib/trpc-client.ts`) rather than
  `@trpc/react-query`, sidestepping React 19 peer-dependency churn. Holding up
  fine through Milestone 2's feed/chat polling+socket pattern; revisit if
  cache invalidation logic starts getting hand-rolled in too many places.
- **Realtime scope**: a user's socket joins every channel they're a member of
  on page load (for live sidebar previews), but there's no presence/typing UI
  yet and no reconnect-with-missed-message backfill — a dropped connection
  just resumes from the next `listMessages` call, it doesn't replay the gap.
- **Feed ranking**: chronological only, no algorithmic ranking or pagination
  UI yet (the API supports cursor-based paging; the Feed page always loads
  page one). Fine at demo scale.
- **Checkout is a stub, not a real charge**: `payments.checkout` marks a paid
  course as instantly "paid" — there's no Razorpay/Stripe session, no
  webhook, no card details collected anywhere. This is the same env-gated
  pattern as email/storage, just not yet wired to a real provider. The
  `stub: true` flag on the response is what drives the "test payment" banner
  in the UI so nobody mistakes it for a live charge.
- **Payouts are computed, not disbursed**: `requestPayout` allocates unpaid
  revenue into a `payouts` row and marks it `pending` — there's no actual
  bank transfer or Stripe/Razorpay Connect payout API call. A payout never
  moves past `pending` in this milestone.
- **No refund flow**: `payments.status` supports `refunded` in the schema,
  but nothing in the API sets it yet.
- **Code-question grading is a keyword rubric, not execution**: with no
  `JUDGE0_URL` set, a code answer scores the fraction of the author's rubric
  keywords it contains (case-insensitive substring) — it does not compile or
  run the submission. The seam for real hidden-test-case execution is in
  `apps/api/src/lib/grading.ts`. Choice and short-answer grading are fully
  deterministic and final.
- **Assessment runner state is client-held**: `startAttempt` stashes the
  served questions in `sessionStorage`; reloading the runner tab loses that
  in-progress attempt (you restart from the catalog, which creates a fresh
  attempt). The graded result itself is always persisted server-side. Retakes
  are unlimited and each is recorded separately.
- **Escrow is a status field, not held funds**: `fundMilestone` /
  `releaseMilestone` just move a milestone through
  `pending → funded → released` — there's no real payment capture, no actual
  money held anywhere, and no payout of released funds to the talent's bank
  account (that would reuse the same `payouts` mechanism as course creator
  earnings, not yet wired up for contract work). The status transitions and
  notifications are real; the money movement is not.
- **No role gating on Hire/Jobs**: any signed-in user can post a job (Hire)
  and also apply to jobs (Jobs) — there's no separate "recruiter" account
  type. A user can't apply to their own posting, but nothing stops one person
  from playing both sides of the marketplace across two of their own job
  posts. Fine for a single-tenant demo; revisit if this becomes a real
  two-sided marketplace with reputation at stake.
- **Org invites require an existing account**: `organizations.addMember`
  looks a person up by the email they already signed up with — there's no
  invite-by-email-to-a-stranger flow (no pending invite row, no signup-time
  auto-join). Fine for a demo where all participants already have accounts;
  a real product would need a pending-invite table and an email link.
- **Cohorts don't gate content or scheduling**: a cohort is really just a
  named, dated, optionally-capped enrollment bucket — picking one doesn't
  change what content is visible or when, and self-paced enrollment is
  always available alongside any cohorts a course has. There's no
  cohort-specific live session calendar yet; that would reuse the existing
  `live` lesson `scheduledAt` field, just filtered per cohort.
- **Mobile onboarding is minimal, not full parity**: `apps/mobile`'s
  onboarding screen only captures name/title/bio — no education, experience,
  or certificate upload yet (that's a camera-roll/file-picker flow the web
  wizard doesn't need to solve). A profile started on mobile can be filled
  out fully from the web app; both write to the same `profiles` row. Jobs,
  Hire, Contracts, and Institutions still have no mobile screens at all —
  only Feed/Chats/Groups/Learn/Assess/Notifications/Me have been ported so far.
- **Biometric unlock has no PIN/passcode fallback UI**: if the device has no
  biometric hardware or nothing enrolled, the lock screen is skipped
  entirely rather than falling back to a passcode prompt — the session is
  only as protected as the OS-level device lock in that case. This is a
  deliberate "skip the gate rather than strand the user" choice for a demo
  build; a shipped app would want `expo-local-authentication`'s device
  passcode fallback or a custom PIN.
- **Push tokens need an EAS project to actually mint**: `expo-notifications`'s
  `getExpoPushTokenAsync()` requires an EAS project ID once you're past the
  legacy push service, and this scaffold doesn't run `eas init` (that's an
  infra step, not code, and ties the repo to a specific Expo account).
  `push.registerToken`/delivery on the backend are fully real and
  smoke-tested (including against Expo's actual push API); the mobile screen
  will show a clear "could not get a push token" message on a fresh clone
  until an EAS project ID is configured in `app.json` — after that, delivery
  needs no further code changes.
- **No device/simulator testing performed here**: this environment is
  Windows with no Xcode (iOS is Mac-only) and no Android emulator installed,
  so verification across all three mobile milestones stopped at
  `tsc --noEmit` (clean across all five workspaces) and `expo export`
  (successfully bundled all 1,372 modules, confirming Metro resolves every
  new dependency through the monorepo root) — not an actual on-device run.
  Test on a real device via Expo Go before relying on this further. The
  `live.getJoinToken` authorization logic and JWT claims *were* fully
  exercised against real (fake-credentialed) LiveKit token minting in a
  backend smoke test — only the actual video connection is untested.
- **Mobile chat diverges from web on purpose**: the web chat page relies
  entirely on the Socket.IO echo to show a message you just sent (it never
  appends locally). Mobile appends the message optimistically with a
  temporary id and reconciles it against either the mutation's response or
  the socket echo, whichever arrives first, deduping by id — mobile networks
  drop/stall more often than a desktop browser tab, and a message that
  silently never appears is a worse failure mode than a brief
  optimistic-then-confirmed flicker.
- **Mobile has no "start a new DM" flow**: Discover (user search) hasn't
  been ported to mobile, so the Chats tab only shows channels that already
  exist (DMs started from web, or study-group channels joined/created from
  the Groups tab) — there's no way to search for a user and start a fresh DM
  from the phone yet.
- **Feed's offline cache covers reads, not writes**: only the first page of
  `posts.feed` is cached for instant/offline display; posting or reacting
  while offline just fails visibly (the react button rolls back and a
  create-post error is shown) rather than being queued and replayed once
  back online. A real offline-first mutation queue is a meaningfully bigger
  feature than "cache the last read," and is deliberately out of scope here.
- **No typing indicators or per-channel unread state**: the server has
  socket plumbing for a `typing` event, but no UI (web or mobile) has ever
  used it; likewise, there's no "unread messages in this channel" tracking
  at all in the schema — only the separate, already-existing per-user
  notification unread count. Mobile's channel list shows the latest message
  preview, not a read/unread indicator per chat.
- **Mobile checkout is a native *UX*, not native IAP**: the payment sheet
  looks and feels like an Apple Pay/Google Pay confirmation, but underneath
  it calls the exact same `payments.checkout` stub as web — no
  `react-native-iap`/`expo-in-app-purchases`, no App Store/Play Store
  product configuration. Real store IAP compliance is explicitly
  Milestone 10 scope; wiring it in now would be non-functional without
  App Store Connect/Play Console products to test against anyway.
- **Mobile has no video player for `video`-type lessons**: unlocked video
  lessons show a "watch it from the web app" hint instead of an inline
  player — no `expo-video`/`expo-av` dependency has been added yet. Text
  lessons and live-class join both work natively on mobile.
- **The LiveKit join token travels through a URL for the mobile path**:
  when mobile opens the web live-room page in an in-app browser, the
  short-lived, room-scoped JWT is passed as a query parameter (there's no
  way for an external browser view to read mobile's SecureStore session).
  This is fine for a local dev demo but isn't hardened for production — a
  shipped app would exchange a short opaque code server-side instead of
  putting the raw token in a URL (which can end up in browser history/logs).
- **Live class rooms have no scheduling enforcement**: anyone
  enrolled/creator can request a join token for a live lesson at any time,
  regardless of its `scheduledAt` — the lesson's scheduled time is display-only
  (shown to learners), not a server-side gate on when `live.getJoinToken`
  will succeed.
- **Reviews have no moderation/reporting**: any learner who's completed a
  course can post any rating/comment — there's no profanity filter, report
  button, or creator-side hide/dispute flow. A course creator can currently
  see (but not remove) a review they disagree with.
- **Ratings are whole stars, no half-star granularity**: `submitReview`'s
  `rating` is a plain 1-5 integer; the average shown (e.g. "4.3 ★") is a
  computed float, but there's no way for a learner to submit a half star.
- **Review eligibility is all-lessons-completed, not creator-defined**: "done
  with the course" is computed purely as *every lesson has a `lessonProgress`
  row for this learner* — there's no separate creator-set "minimum to
  review" threshold (e.g. skip an optional bonus module) and no way to
  review a course with zero lessons at all.
- **Design system migration covers 2 of 5 batches, not all pages**: MUI is
  installed, themed (fonts/colors/motion), wired into the root layout and
  `AppShell`'s nav. Auth/Onboarding (`otp-auth-form.tsx`,
  `onboarding/page.tsx`) and the Community shell (`feed`, `discover`,
  `chats`, `groups`, `notifications`, `profile`) are fully rebuilt on MUI
  components (`TextField`, `Button`, `Stepper`, `ToggleButtonGroup`, `List`,
  `Chip`, etc.). The remaining 17 pages (Learning Hub, Hiring marketplace,
  Institutions) haven't had their markup rewritten from the original
  hand-written `globals.css` classes (`.card`, `.field`, `button.primary`,
  etc.) yet. They still render correctly (`AppShell` still wraps children in
  the legacy `.shell.wide` container alongside the new MUI nav), but
  visually they're a mix of the old look and the new chrome/typography
  until each remaining batch gets migrated.
- **MUI v9's API differs from earlier MUI versions in ways worth knowing
  before writing more pages**: `Stack`/`Typography`/etc. no longer accept
  layout shorthand props (`justifyContent`, `alignItems`, `fontWeight`)
  directly — they must go in `sx`. `Tabs`' `TabIndicatorProps` was renamed
  to `slotProps.indicator`. Both caused real typecheck failures during this
  migration; the fixes are in place, but watch for the same pattern in the
  remaining batches.
- **MUI adds real bundle weight**: first-load JS per authenticated page grew
  from ~126 kB to ~187 kB after adding `@mui/material`/`@emotion/*` — expected
  cost of a component library, not a regression to chase down.
- **No visual/screenshot verification was possible in this environment**:
  there's no connected browser-automation tool in this session, so the theme
  and responsive nav were verified via `next build` succeeding, `tsc --noEmit`
  passing, and inspecting the compiled CSS output (confirmed both font
  variables and the theme's colors are present) rather than an actual
  rendered screenshot. Open it in a real browser and resize the viewport
  before relying on the mobile-first `Drawer`/`Tabs` breakpoint behavior
  further.
- **Content/copy tone pass covers only the migrated pages so far**: headings
  and empty-states on the migrated pages were rewritten to be more
  professional/benefit-oriented ("Welcome back", "Build your profile", "See
  what your community is building and discussing", "Finish building your
  profile to unlock courses, jobs, and your community"); the remaining 17
  pages' copy (hints, placeholders, empty states) is unchanged and still
  casual in places (e.g. "Loading…") — this continues alongside each page's
  MUI migration, not as a separate sweep.
- **Chat bubble alignment/colors on web are new, unverified on a real
  device/browser**: the migrated Chats page colors the current user's
  message bubbles with the theme's black CTA color and left-aligns
  everyone else's — this is a first pass at real chat-bubble styling
  (previously plain rows with a "mine" CSS class) and hasn't been visually
  confirmed beyond the compiled build succeeding (see the
  no-browser-tool limitation above).

## Roadmap

Web first, then the mobile apps reuse this same backend unchanged (see the
shared-backend validation diagram from the planning phase — auth, tRPC
routers, and Postgres schema all carry over as-is; mobile only *adds*
services, it doesn't replace any).

| # | Milestone | Scope |
|---|---|---|
| 1 | **Identity** *(done)* | repo/CI/docker-compose · email+OTP auth · JWT sessions · profile wizard · privacy settings · certificate uploads |
| 2 | **Community shell** *(done, this repo)* | home feed, posts, reactions, follows · discover (Postgres FTS) · realtime chat + groups · notifications |
| 3 | **Learning Hub** *(done, this repo)* | course builder · free/paid/live pricing + checkout · enrollment & progress · creator payouts |
| 4 | **Groups & assessments** *(done, this repo)* | study groups on chat channels · question bank + timed runner · auto-grading (+ code sandbox) |
| 5 | **Hiring marketplace** *(done, this repo)* | recruiter job listings + pipeline · talent apply flow · contracts + escrow payments |
| 6 | **Institutions & Academy** *(done, this repo)* | org accounts · paid/free/sample course publishing · cohort scheduling |
| 7 | **Mobile shell** *(done, this repo)* | Expo RN scaffold (iOS + Android) · JWT + secure storage + biometric unlock · push token registration |
| 8 | **Mobile realtime & community** *(done, this repo)* | chat/study groups on-device · push notifications end-to-end · offline feed cache |
| 9 | **Mobile commerce & assessments** *(done, this repo)* | native payment SDK checkout · assessment runner (reduced code-question UX) · live class join (LiveKit) |
| 10 | Store launch | EAS builds · TestFlight/Play internal testing · IAP/store compliance review · phased rollout |

Milestone 10 is not implemented yet — this repo is intentionally scoped to
Milestones 1-9 so it can be reviewed and run before more is built on top of it.
