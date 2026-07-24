"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AssessmentSummary, AttemptHistoryItem } from "@trafy-community/core";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";

type View = "take" | "author";

export default function AssessPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("take");

  const [published, setPublished] = useState<AssessmentSummary[]>([]);
  const [mine, setMine] = useState<AssessmentSummary[]>([]);
  const [attempts, setAttempts] = useState<AttemptHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(0);
  const [passingPercent, setPassingPercent] = useState(60);
  const [creating, setCreating] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [pub, own, hist] = await Promise.all([
        withAuthRetry(() => trpc.assessments.listPublished.query({})),
        withAuthRetry(() => trpc.assessments.listMine.query()),
        withAuthRetry(() => trpc.assessments.myAttempts.query()),
      ]);
      setPublished(pub);
      setMine(own);
      setAttempts(hist);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load assessments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const created = await withAuthRetry(() =>
        trpc.assessments.create.mutate({
          title,
          description: description || undefined,
          timeLimitSeconds: timeLimitMinutes > 0 ? timeLimitMinutes * 60 : undefined,
          passingScore: passingPercent / 100,
        })
      );
      router.push(`/assess/${created.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the assessment.");
    } finally {
      setCreating(false);
    }
  }

  async function startAttempt(assessmentId: string) {
    setStartingId(assessmentId);
    setError(null);
    try {
      const attempt = await withAuthRetry(() => trpc.assessments.startAttempt.mutate({ assessmentId }));
      // Stash the served questions so the runner doesn't need a second round-trip.
      sessionStorage.setItem(`attempt:${attempt.id}`, JSON.stringify(attempt));
      router.push(`/assess/${assessmentId}/take?attempt=${attempt.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the assessment.");
    } finally {
      setStartingId(null);
    }
  }

  return (
    <AppShell active="assess">
      <div className="brand">Assessments</div>
      <p className="subtitle">Test your skills, or author an assessment for others.</p>
      {error && <div className="error-banner">{error}</div>}

      <div className="tab-strip">
        <button className={view === "take" ? "active" : ""} onClick={() => setView("take")}>
          Take
        </button>
        <button className={view === "author" ? "active" : ""} onClick={() => setView("author")}>
          Author
        </button>
      </div>

      {view === "take" ? (
        <>
          {loading ? (
            <p className="hint">Loading…</p>
          ) : published.length === 0 ? (
            <p className="hint">No published assessments yet.</p>
          ) : (
            <div className="course-grid">
              {published.map((a) => (
                <div key={a.id} className="course-card">
                  <h3>{a.title}</h3>
                  {a.description && <p style={{ fontSize: 13, margin: 0 }}>{a.description}</p>}
                  <span className="hint">
                    {a.questionCount} question{a.questionCount === 1 ? "" : "s"} ·{" "}
                    {a.timeLimitSeconds ? `${Math.round(a.timeLimitSeconds / 60)} min` : "untimed"} · pass{" "}
                    {Math.round(a.passingScore * 100)}%
                  </span>
                  <button
                    className="primary"
                    disabled={startingId === a.id || a.questionCount === 0}
                    onClick={() => startAttempt(a.id)}
                  >
                    {startingId === a.id ? "Starting…" : "Start"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {attempts.length > 0 && (
            <>
              <div className="section-title">Your past attempts</div>
              {attempts.map((att) => (
                <div className="answer-breakdown-row" key={att.attemptId}>
                  <span>{att.title}</span>
                  <span>
                    <span className={`result-verdict ${att.passed ? "passed" : "failed"}`} style={{ fontSize: 11, padding: "2px 10px" }}>
                      {att.passed ? "Passed" : "Failed"}
                    </span>{" "}
                    <strong>{att.percent}%</strong>
                  </span>
                </div>
              ))}
            </>
          )}
        </>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="section-title" style={{ marginTop: 0 }}>
              Create an assessment
            </div>
            <form onSubmit={handleCreate}>
              <div className="field">
                <label>Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div className="field">
                <label>Description</label>
                <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>Time limit (minutes, 0 = untimed)</label>
                  <input type="number" min={0} value={timeLimitMinutes} onChange={(e) => setTimeLimitMinutes(Number(e.target.value))} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Passing score (%)</label>
                  <input type="number" min={0} max={100} value={passingPercent} onChange={(e) => setPassingPercent(Number(e.target.value))} />
                </div>
              </div>
              <button className="primary" type="submit" disabled={creating || !title.trim()}>
                {creating ? "Creating…" : "Create & add questions"}
              </button>
            </form>
          </div>

          {loading ? (
            <p className="hint">Loading…</p>
          ) : mine.length === 0 ? (
            <p className="hint">You haven't authored any assessments yet.</p>
          ) : (
            <div className="course-grid">
              {mine.map((a) => (
                <Link key={a.id} href={`/assess/${a.id}/edit`} className="course-card" style={{ textDecoration: "none", color: "inherit" }}>
                  <span className="badge" style={{ background: a.published ? "var(--accent)" : "var(--line)", alignSelf: "flex-start" }}>
                    {a.published ? "Published" : "Draft"}
                  </span>
                  <h3>{a.title}</h3>
                  <span className="hint">
                    {a.questionCount} question{a.questionCount === 1 ? "" : "s"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
