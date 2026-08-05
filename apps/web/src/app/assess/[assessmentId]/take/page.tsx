"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMediaQuery, useTheme } from "@mui/material";
import type { AnswerResponsePayload, NextQuestionResult, SubmitSessionResult } from "@trafy-community/core";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";

/** The client-visible shape of a question payload — toSafePayload has already
 *  stripped correctIndex / acceptable / keywords / hidden test cases server-side. */
type SafePayload = { options?: string[]; language?: string; starterCode?: string };

type LoadedQuestion = Extract<NextQuestionResult, { done: false }>;

export default function TakeAssessmentPage() {
  const params = useParams<{ assessmentId: string }>();
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [current, setCurrent] = useState<LoadedQuestion | null>(null);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [response, setResponse] = useState<AnswerResponsePayload>({});
  const [result, setResult] = useState<SubmitSessionResult | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  // Start (or resume) the session. The server owns session state now, so a
  // reload no longer loses an in-progress attempt.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const started = await withAuthRetry(() =>
          trpc.assessments.startSession.mutate({ assessmentId: params.assessmentId, webcamConsent: false })
        );
        if (!cancelled) setSessionId(started.sessionId);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not start this assessment.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.assessmentId]);

  const loadQuestion = useCallback(
    async (sid: string, at: number) => {
      setLoading(true);
      setError(null);
      try {
        const next = await withAuthRetry(() => trpc.assessments.getNextQuestion.query({ sessionId: sid, index: at }));
        setTotal(next.total);
        if (next.done) {
          setCurrent(null);
        } else {
          setCurrent(next);
          // Reset the draft response for the newly shown question; code
          // questions start from the author's starter code.
          const payload = next.question.payload as SafePayload;
          setResponse(next.question.kind === "code" ? { source: payload.starterCode ?? "" } : {});
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load the next question.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (sessionId) loadQuestion(sessionId, index);
  }, [sessionId, index, loadQuestion]);

  const handleSubmitSession = useCallback(async () => {
    if (!sessionId || submittedRef.current) return;
    submittedRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await withAuthRetry(() => trpc.assessments.submitSession.mutate({ sessionId }));
      setResult(res);
    } catch (err) {
      submittedRef.current = false;
      setError(err instanceof Error ? err.message : "Could not submit your session.");
    } finally {
      setBusy(false);
    }
  }, [sessionId]);

  // Countdown from the server-issued expiry; auto-submits at zero.
  useEffect(() => {
    if (!current || result) return;
    const deadline = new Date(current.expiresAt).getTime();
    const tick = () => {
      const secs = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemaining(secs);
      if (secs <= 0) handleSubmitSession();
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [current, result, handleSubmitSession]);

  // Integrity telemetry — the server flags a session after repeated events.
  useEffect(() => {
    if (!sessionId || result) return;
    const send = (event: "blur" | "paste") => {
      withAuthRetry(() => trpc.assessments.recordTelemetry.mutate({ sessionId, event })).catch(() => {
        /* telemetry is best-effort — never block the candidate on it */
      });
    };
    const onBlur = () => send("blur");
    const onPaste = () => send("paste");
    window.addEventListener("blur", onBlur);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("paste", onPaste);
    };
  }, [sessionId, result]);

  async function saveAndAdvance() {
    if (!sessionId || !current) return;
    setBusy(true);
    setError(null);
    try {
      await withAuthRetry(() =>
        trpc.assessments.submitAnswer.mutate({ sessionId, questionId: current.question.id, response })
      );
      setIndex((i) => i + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your answer.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !current && !result) {
    return (
      <AppShell active="assess">
        <div className="error-banner">{error}</div>
        <button className="secondary" onClick={() => router.push("/assess")}>
          Back to assessments
        </button>
      </AppShell>
    );
  }

  if (result) {
    return (
      <AppShell active="assess">
        <div className="result-hero">
          <div className="score">{Math.round(result.rawScore * 100)}%</div>
          <div className="result-verdict">{Math.round(result.percentile)}th percentile</div>
          <p className="hint" style={{ marginTop: 10 }}>
            {result.pending
              ? "Your code answers are still being executed — this score will update once grading finishes."
              : "Scored against everyone else who has taken this track."}
          </p>
        </div>
        <div style={{ marginTop: 20 }}>
          <button className="primary" onClick={() => router.push("/assess")}>
            Back to assessments
          </button>
        </div>
      </AppShell>
    );
  }

  if (loading && !current) {
    return (
      <AppShell active="assess">
        <p className="hint">Loading…</p>
      </AppShell>
    );
  }

  // Reached the end of the question list — offer the final submit.
  if (!current) {
    return (
      <AppShell active="assess">
        <div className="brand">All questions answered</div>
        <p className="subtitle">Submit to have your session graded and scored against the cohort.</p>
        {error && <div className="error-banner">{error}</div>}
        <div style={{ display: "flex", gap: 12 }}>
          <button className="secondary" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={busy}>
            Back
          </button>
          <button className="primary" onClick={handleSubmitSession} disabled={busy}>
            {busy ? "Submitting…" : "Submit assessment"}
          </button>
        </div>
      </AppShell>
    );
  }

  const q = current.question;
  const payload = q.payload as SafePayload;

  if (q.kind === "code" && isMobile) {
    return (
      <AppShell active="assess">
        <div className="error-banner" style={{ margin: "40px auto", maxWidth: 400, textAlign: "center" }}>
          <h2 style={{ marginBottom: 12 }}>Desktop Required</h2>
          <p>
            Coding rounds are desktop-only. Please continue this assessment on a desktop device to ensure a proper
            coding environment.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell active="assess">
      {remaining !== null && (
        <div className={`timer ${remaining <= 30 ? "warning" : ""}`}>
          <span>
            Question {current.index + 1} of {total}
          </span>
          <span>
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
          </span>
        </div>
      )}
      {error && <div className="error-banner">{error}</div>}

      <div className="question-card">
        <span className="q-kind">
          {current.index + 1}. {q.kind.replace("_", " ")}
        </span>
        <p className="q-prompt" style={{ marginTop: 6 }}>
          {q.prompt}
        </p>

        {q.kind === "single_choice" &&
          payload.options?.map((opt, oi) => (
            <label className="option-row" key={oi}>
              <input
                type="radio"
                name={q.id}
                checked={response.selectedIndex === oi}
                onChange={() => setResponse({ selectedIndex: oi })}
              />
              {opt}
            </label>
          ))}

        {q.kind === "multi_choice" &&
          payload.options?.map((opt, oi) => {
            const selected = response.selectedIndices ?? [];
            return (
              <label className="option-row" key={oi}>
                <input
                  type="checkbox"
                  checked={selected.includes(oi)}
                  onChange={() =>
                    setResponse({
                      selectedIndices: selected.includes(oi)
                        ? selected.filter((x) => x !== oi)
                        : [...selected, oi],
                    })
                  }
                />
                {opt}
              </label>
            );
          })}

        {q.kind === "short_answer" && (
          <input
            value={response.text ?? ""}
            onChange={(e) => setResponse({ text: e.target.value })}
            placeholder="Your answer"
            style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8 }}
          />
        )}

        {q.kind === "code" && (
          <textarea
            className="code-input"
            value={response.source ?? ""}
            onChange={(e) => setResponse({ source: e.target.value })}
            spellCheck={false}
          />
        )}
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <button className="secondary" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={busy || index === 0}>
          Back
        </button>
        <button className="primary" onClick={saveAndAdvance} disabled={busy}>
          {busy ? "Saving…" : current.index + 1 === total ? "Save & finish" : "Save & continue"}
        </button>
      </div>
    </AppShell>
  );
}
