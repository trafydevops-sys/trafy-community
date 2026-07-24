"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import type { AnswerResponse, Attempt, AttemptResult } from "@trafy-community/core";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";

export default function TakeAssessmentPage() {
  return (
    <Suspense fallback={null}>
      <TakeAssessmentInner />
    </Suspense>
  );
}

function TakeAssessmentInner() {
  const params = useParams<{ assessmentId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const attemptId = searchParams.get("attempt");

  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerResponse>>({});
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(false);

  // The served attempt (questions with answer keys stripped) is stashed in
  // sessionStorage by the catalog's "Start" button so we don't re-round-trip.
  useEffect(() => {
    if (!attemptId) {
      setError("No attempt in progress — start the assessment from the catalog.");
      return;
    }
    const raw = sessionStorage.getItem(`attempt:${attemptId}`);
    if (!raw) {
      setError("This attempt session was lost (did you reload?). Start again from the catalog.");
      return;
    }
    setAttempt(JSON.parse(raw) as Attempt);
  }, [attemptId]);

  const handleSubmit = useCallback(async () => {
    if (!attempt || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await withAuthRetry(() =>
        trpc.assessments.submitAttempt.mutate({ attemptId: attempt.id, answers: Object.values(answers) })
      );
      sessionStorage.removeItem(`attempt:${attempt.id}`);
      setResult(res);
    } catch (err) {
      submittedRef.current = false;
      setError(err instanceof Error ? err.message : "Could not submit your attempt.");
    } finally {
      setSubmitting(false);
    }
  }, [attempt, answers]);

  // Countdown timer for timed assessments; auto-submits at zero.
  useEffect(() => {
    if (!attempt || !attempt.timeLimitSeconds || result) return;
    const deadline = new Date(attempt.startedAt).getTime() + attempt.timeLimitSeconds * 1000;
    const tick = () => {
      const secs = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemaining(secs);
      if (secs <= 0) handleSubmit();
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [attempt, result, handleSubmit]);

  function setAnswer(questionId: string, patch: Partial<AnswerResponse>) {
    setAnswers((current) => ({ ...current, [questionId]: { questionId, ...current[questionId], ...patch } }));
  }

  if (error && !attempt) {
    return (
      <AppShell active="assess">
        <div className="error-banner">{error}</div>
        <button className="secondary" onClick={() => router.push("/assess")}>
          Back to assessments
        </button>
      </AppShell>
    );
  }

  if (!attempt) {
    return (
      <AppShell active="assess">
        <p className="hint">Loading…</p>
      </AppShell>
    );
  }

  if (result) {
    return (
      <AppShell active="assess">
        <div className={`result-hero ${result.passed ? "passed" : "failed"}`}>
          <div className="score">{result.percent}%</div>
          <div className={`result-verdict ${result.passed ? "passed" : "failed"}`}>{result.passed ? "Passed" : "Failed"}</div>
          <p className="hint" style={{ marginTop: 10 }}>
            {result.rawScore} / {result.maxScore} points · passing mark {Math.round(result.passingScore * 100)}%
          </p>
        </div>

        <div className="section-title">Breakdown</div>
        {result.answers.map((a, i) => (
          <div className="answer-breakdown-row" key={a.questionId}>
            <span style={{ flex: 1 }}>
              {i + 1}. {a.prompt.slice(0, 80)}
              {a.prompt.length > 80 ? "…" : ""}
            </span>
            <strong style={{ color: a.scoreFraction >= 1 ? "var(--accent-strong)" : a.scoreFraction > 0 ? "var(--ink)" : "var(--danger)" }}>
              {a.awardedPoints} / {a.points}
            </strong>
          </div>
        ))}

        <div style={{ marginTop: 20 }}>
          <button className="primary" onClick={() => router.push("/assess")}>
            Back to assessments
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell active="assess">
      {remaining !== null && (
        <div className={`timer ${remaining <= 30 ? "warning" : ""}`}>
          <span>{attempt.title}</span>
          <span>
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
          </span>
        </div>
      )}
      <div className="brand">{attempt.title}</div>
      <p className="subtitle">Answer all {attempt.questions.length} questions, then submit.</p>
      {error && <div className="error-banner">{error}</div>}

      {attempt.questions.map((q, i) => {
        const answer = answers[q.id];
        return (
          <div className="question-card" key={q.id}>
            <span className="q-kind">
              {i + 1}. {q.kind.replace("_", " ")} · {q.points} pt{q.points === 1 ? "" : "s"}
            </span>
            <p className="q-prompt" style={{ marginTop: 6 }}>
              {q.prompt}
            </p>

            {q.kind === "single_choice" &&
              q.options?.map((opt, oi) => (
                <label className="option-row" key={oi}>
                  <input
                    type="radio"
                    name={q.id}
                    checked={answer?.selectedIndex === oi}
                    onChange={() => setAnswer(q.id, { selectedIndex: oi })}
                  />
                  {opt}
                </label>
              ))}

            {q.kind === "multi_choice" &&
              q.options?.map((opt, oi) => {
                const selected = answer?.selectedIndices ?? [];
                return (
                  <label className="option-row" key={oi}>
                    <input
                      type="checkbox"
                      checked={selected.includes(oi)}
                      onChange={() =>
                        setAnswer(q.id, {
                          selectedIndices: selected.includes(oi) ? selected.filter((x) => x !== oi) : [...selected, oi],
                        })
                      }
                    />
                    {opt}
                  </label>
                );
              })}

            {q.kind === "short_answer" && (
              <input
                value={answer?.text ?? ""}
                onChange={(e) => setAnswer(q.id, { text: e.target.value })}
                placeholder="Your answer"
                style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8 }}
              />
            )}

            {q.kind === "code" && (
              <textarea
                className="code-input"
                value={answer?.source ?? q.starterCode ?? ""}
                onChange={(e) => setAnswer(q.id, { source: e.target.value })}
                spellCheck={false}
              />
            )}
          </div>
        );
      })}

      <button className="primary" onClick={handleSubmit} disabled={submitting}>
        {submitting ? "Submitting…" : "Submit assessment"}
      </button>
    </AppShell>
  );
}
