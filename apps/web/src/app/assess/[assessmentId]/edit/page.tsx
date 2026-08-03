// @ts-nocheck
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import type { AssessmentForEdit, QuestionKind } from "@trafy-community/core";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";

export default function AssessmentBuilderPage() {
  const params = useParams<{ assessmentId: string }>();
  const assessmentId = params.assessmentId;

  const [assessment, setAssessment] = useState<AssessmentForEdit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const detail = await withAuthRetry(() => trpc.assessments.getForEdit.query({ assessmentId }));
      setAssessment(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this assessment.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId]);

  async function togglePublish() {
    if (!assessment) return;
    setError(null);
    try {
      await withAuthRetry(() => trpc.assessments.setPublished.mutate({ assessmentId, published: !assessment.published }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update publish status.");
    }
  }

  if (loading) {
    return (
      <AppShell active="assess">
        <p className="hint">Loading…</p>
      </AppShell>
    );
  }

  if (!assessment) {
    return (
      <AppShell active="assess">
        <div className="error-banner">{error ?? "Assessment not found."}</div>
      </AppShell>
    );
  }

  return (
    <AppShell active="assess">
      <div className="brand">{assessment.title}</div>
      <p className="subtitle">
        {assessment.published ? "Published" : "Draft"} · {assessment.questionCount} question
        {assessment.questionCount === 1 ? "" : "s"} · pass {Math.round(assessment.passingScore * 100)}% ·{" "}
        {assessment.timeLimitSeconds ? `${Math.round(assessment.timeLimitSeconds / 60)} min` : "untimed"}
      </p>
      {error && <div className="error-banner">{error}</div>}

      <div style={{ marginBottom: 20 }}>
        <button className="secondary" onClick={togglePublish} disabled={assessment.questionCount === 0}>
          {assessment.published ? "Unpublish" : "Publish"}
        </button>
        {assessment.questionCount === 0 && <span className="hint"> — add at least one question to publish.</span>}
      </div>

      <div className="section-title" style={{ marginTop: 0 }}>
        Questions
      </div>
      {assessment.questions.map((q, i) => (
        <div className="question-card" key={q.id}>
          <span className="q-kind">
            {i + 1}. {q.kind.replace("_", " ")} · {q.points} pt{q.points === 1 ? "" : "s"}
          </span>
          <p className="q-prompt" style={{ marginTop: 6 }}>
            {q.prompt}
          </p>
          {q.options && q.options.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {q.options.map((opt, oi) => {
                const correctIndex = q.answerKey.correctIndex;
                const correctIndices = Array.isArray(q.answerKey.correctIndices) ? (q.answerKey.correctIndices as number[]) : [];
                const isCorrect = correctIndex === oi || correctIndices.includes(oi);
                return (
                  <li key={oi} style={{ color: isCorrect ? "var(--accent-strong)" : "inherit", fontWeight: isCorrect ? 700 : 400 }}>
                    {opt} {isCorrect && "✓"}
                  </li>
                );
              })}
            </ul>
          )}
          {q.kind === "short_answer" && Array.isArray(q.answerKey.acceptable) && (
            <span className="hint">Accepts: {(q.answerKey.acceptable as string[]).join(", ")}</span>
          )}
          {q.kind === "code" && Array.isArray(q.answerKey.keywords) && (
            <span className="hint">Rubric keywords: {(q.answerKey.keywords as string[]).join(", ")}</span>
          )}
        </div>
      ))}

      <QuestionAdder assessmentId={assessmentId} onAdded={load} />
    </AppShell>
  );
}

function QuestionAdder({ assessmentId, onAdded }: { assessmentId: string; onAdded: () => void }) {
  const [kind, setKind] = useState<QuestionKind>("single_choice");
  const [prompt, setPrompt] = useState("");
  const [points, setPoints] = useState(1);
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [correctIndices, setCorrectIndices] = useState<number[]>([]);
  const [acceptable, setAcceptable] = useState("");
  const [language, setLanguage] = useState("python");
  const [keywords, setKeywords] = useState("");
  const [starterCode, setStarterCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPrompt("");
    setPoints(1);
    setOptions(["", ""]);
    setCorrectIndex(0);
    setCorrectIndices([]);
    setAcceptable("");
    setKeywords("");
    setStarterCode("");
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (kind === "single_choice") {
        await withAuthRetry(() =>
          trpc.assessments.addQuestion.mutate({ assessmentId, kind, prompt, points, options: options.filter((o) => o.trim()), correctIndex })
        );
      } else if (kind === "multi_choice") {
        await withAuthRetry(() =>
          trpc.assessments.addQuestion.mutate({ assessmentId, kind, prompt, points, options: options.filter((o) => o.trim()), correctIndices })
        );
      } else if (kind === "short_answer") {
        await withAuthRetry(() =>
          trpc.assessments.addQuestion.mutate({
            assessmentId,
            kind,
            prompt,
            points,
            acceptable: acceptable.split(",").map((s) => s.trim()).filter(Boolean),
          })
        );
      } else {
        await withAuthRetry(() =>
          trpc.assessments.addQuestion.mutate({
            assessmentId,
            kind,
            prompt,
            points,
            language,
            starterCode: starterCode || undefined,
            keywords: keywords.split(",").map((s) => s.trim()).filter(Boolean),
          })
        );
      }
      reset();
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the question.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="section-title" style={{ marginTop: 0 }}>
        Add a question
      </div>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleAdd}>
        <div style={{ display: "flex", gap: 12 }}>
          <div className="field" style={{ flex: 2 }}>
            <label>Type</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as QuestionKind)}>
              <option value="single_choice">Single choice</option>
              <option value="multi_choice">Multiple choice</option>
              <option value="short_answer">Short answer</option>
              <option value="code">Code</option>
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Points</label>
            <input type="number" min={1} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
          </div>
        </div>

        <div className="field">
          <label>Prompt</label>
          <textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} required />
        </div>

        {(kind === "single_choice" || kind === "multi_choice") && (
          <div className="field">
            <label>Options {kind === "single_choice" ? "(pick the correct one)" : "(check all correct)"}</label>
            {options.map((opt, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <input
                  type={kind === "single_choice" ? "radio" : "checkbox"}
                  name="correct"
                  checked={kind === "single_choice" ? correctIndex === i : correctIndices.includes(i)}
                  onChange={() => {
                    if (kind === "single_choice") setCorrectIndex(i);
                    else setCorrectIndices((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]));
                  }}
                />
                <input
                  value={opt}
                  onChange={(e) => setOptions((os) => os.map((o, oi) => (oi === i ? e.target.value : o)))}
                  placeholder={`Option ${i + 1}`}
                  style={{ flex: 1 }}
                />
              </div>
            ))}
            <button type="button" className="link" onClick={() => setOptions((os) => [...os, ""])}>
              + Add option
            </button>
          </div>
        )}

        {kind === "short_answer" && (
          <div className="field">
            <label>Acceptable answers (comma-separated, case-insensitive)</label>
            <input value={acceptable} onChange={(e) => setAcceptable(e.target.value)} placeholder="e.g. O(n), linear" />
          </div>
        )}

        {kind === "code" && (
          <>
            <div style={{ display: "flex", gap: 12 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Language</label>
                <input value={language} onChange={(e) => setLanguage(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Starter code (optional)</label>
              <textarea rows={3} className="code-input" value={starterCode} onChange={(e) => setStarterCode(e.target.value)} />
            </div>
            <div className="field">
              <label>Rubric keywords (comma-separated)</label>
              <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="e.g. def, return, for" />
              <p className="hint">
                Graded by keyword presence until a Judge0 sandbox is configured — see the README on code grading.
              </p>
            </div>
          </>
        )}

        <button className="primary" type="submit" disabled={busy || !prompt.trim()}>
          {busy ? "Adding…" : "Add question"}
        </button>
      </form>
    </div>
  );
}
