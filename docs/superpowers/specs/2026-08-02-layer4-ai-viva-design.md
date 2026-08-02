# Assessment Layer 4: AI Viva (Explain-Your-Code)

## Context

Layer 4 is the ★ differentiator from the platform vision doc: after a candidate submits a
Layer 3 build mission, the system generates questions *from their actual submission* and
records them defending it — "why sliding window, not token bucket?" — graded on
understanding, tradeoffs, and honesty. An LLM can write code for someone; it's much harder
to improvise a consistent, specific defense of tradeoffs under time pressure. This is the
sharpest wedge in the whole product, per the strategy discussion earlier in this thread.

**Neither codebase has this today.** trafy-platform's `missionSubmissions.evaluation` is
text/repo-based AI grading (no video/audio, no generated follow-up questions) — so this is
genuinely new work, not a port, though it reuses trafy-platform's mission schema and
`trafy-community`'s existing upload pipeline.

**Dependency:** this spec assumes Layer 3 (`missions` / `mission_submissions`) exists.
Since Layer 3 has its own spec still to be written, this document ports the minimal Layer 3
schema needed to ground Layer 4 concretely — the full mission-ladder unlock UI/API is out
of scope here.

**Two explicit scope decisions, flagged rather than silently assumed:**
1. **No live GitHub integration.** Fetching a repo's actual diff would need GitHub
   OAuth/API wiring that doesn't exist in either repo. V1 requires the candidate to paste
   their key code/diff as text alongside the repo URL at submission time; question
   generation reads that pasted text, not a live fetch.
2. **Audio, not video** (per your last answer) — MediaRecorder captures audio only,
   transcribed, and the transcript is graded. No video storage/bandwidth cost, and grading
   text is far more reliable than asking an LLM to judge video.

## Architecture

```
Layer 3 submission (status: passed)
   │
   ▼
generateVivaQuestions()  ──►  Claude API  ──►  viva_questions rows (3-5 per submission)
   │
   ▼
Candidate UI: records audio per question (MediaRecorder)
   │
   ▼
POST /uploads/viva_answer  (existing multipart route, new upload kind)
   │
   ▼
viva_answers row (audioUrl)  ──►  BullMQ transcription job  ──►  transcript written
   │
   ▼  (once all answers for a submission have transcripts)
BullMQ grading job  ──►  Claude API (rubric: understanding/tradeoffs/honesty)
   │
   ▼
viva_evaluations row (dimensions, overallScore, llmRationale)
   │
   ▼
Socket.IO: viva:graded → candidate, viva:flagged-style update → recruiter dashboard
   │
   ▼
Recruiter: optional human spot-check mutation → viva_evaluations.humanSpotCheck
```

## Data model

Additions to `packages/db/src/schema.ts`, following this repo's `text()`-not-`pgEnum`
convention:

- **`missions`** (Layer 3, minimal port) — `id, externalId (nullable unique), trackSlug,
  trackTitle, orderIndex (int), title, brief, requirements (jsonb string[]), difficulty
  (int 1-5), active (bool), createdAt`.

- **`mission_submissions`** (Layer 3, minimal port) — `id, userId, missionId (FK), repoUrl,
  demoUrl (nullable), pastedDiff (text — the v1 GitHub-access workaround), notes, status
  (text — 'submitted'|'evaluating'|'passed'|'needs_revision'), createdAt, evaluatedAt`.

- **`viva_questions`** (new) — `id, submissionId (FK to mission_submissions), prompt (text,
  generated), order (int), createdAt`.

- **`viva_answers`** (new) — `id, questionId (FK), userId, audioUrl (text — storage path
  via existing saveUpload), transcript (text, nullable until transcribed),
  durationSeconds (int, nullable), recordedAt`.

- **`viva_evaluations`** (new) — one per submission. `id, submissionId (FK, unique),
  dimensions (jsonb — { understanding: 0-100, tradeoffs: 0-100, honesty: 0-100 }),
  overallScore (real, 0-100), llmRationale (text), humanSpotCheck (jsonb, nullable — {
  reviewerId, verdict, notes }), status (text — 'pending'|'graded'|'appealed'), createdAt`.

## Question generation

`generateVivaQuestions(submission)` in `apps/api/src/lib/viva.ts`:
- Input: `mission_submissions.notes` + `pastedDiff` (the candidate's own write-up and code,
  not a live fetch — see scope decision above).
- Calls Claude with a prompt template instructing it to ask specific questions referencing
  actual choices visible in the pasted content (e.g., a named function, a specific library
  choice) rather than generic questions — this specificity is what makes the answer
  unfakeable.
- Writes 3-5 `viva_questions` rows.
- Triggered when a submission's Layer 3 harness marks it `passed` (or manually, by a
  recruiter, for submissions that need a re-run).

## Recording & upload

- New `uploadKind` value `"viva_answer"` added to `uploadKindSchema` in
  `@trafy-community/core` — reuses the existing `POST /uploads/:kind` route in
  `apps/api/src/server.ts` (already handles auth + multipart, no new endpoint needed).
- Candidate UI: browser `MediaRecorder` (audio-only, e.g. `audio/webm`) per question, one
  at a time, upload creates the `viva_answers` row.

## Transcription (new env-gated seam)

Matches this repo's existing "graceful degrade without keys" pattern (Resend/S3/Judge0/
LiveKit all work this way in `apps/api/src/lib/env.ts`):
- New optional env var `TRANSCRIPTION_API_URL`.
- `usingTranscriptionStub = !env.TRANSCRIPTION_API_URL` — when unset, `transcript` is set
  to a literal `"[transcription unavailable — dev stub]"` placeholder so the pipeline (and
  grading step) is fully exercisable in local dev without a real provider.
- **Provider choice is left open** — this is the one real gap in "start building now": pick
  a speech-to-text vendor before this goes to production. The seam doesn't care which.
- Runs as a BullMQ job (same queue infra as Phase 0's Judge0 worker), enqueued on
  `viva_answers` insert.

## Grading

- Once every `viva_answers` row for a submission has a non-null `transcript`, enqueue a
  `grade-viva` job.
- Claude call: rubric (understanding/tradeoffs/honesty, per the vision doc) + all
  transcripts + the original `notes`/`pastedDiff` for grounding.
- Writes `viva_evaluations` (dimensions + overallScore + llmRationale), status → `graded`.
- Human spot-check is a separate, later mutation a recruiter can call — matches "LLM rubric
  + human spot-check," not gating every result on human review.

## Real-time

Same Socket.IO gateway as Phase 0. `viva:graded` to the candidate's `session:{submissionId}`
room; an equivalent event to a recruiter room once the recruiter console (separate spec)
exists to consume it.

## Error handling

- Transcription/grading job failure: BullMQ retry (matches Phase 0's pattern); submission
  status reflects a clear "processing" vs "failed, retrying" state — never an infinite
  spinner.
- Partial answers (candidate skips a question): grading proceeds on what exists;
  `dimensions` can reflect a lower `understanding` score for gaps rather than blocking the
  whole evaluation.

## Testing

- Unit test the question-generation prompt builder (mock Claude client, assert the prompt
  actually includes submission-specific content, not a generic template).
- Integration test the record → transcribe → grade pipeline using the dev transcription
  stub and a mocked Claude grading response, asserting the `viva_evaluations` row shape.

## Out of scope here

Full Layer 3 mission-ladder UI/unlock logic, recruiter console (compare view, CSV export),
appeals workflow, cross-submission plagiarism detection.
