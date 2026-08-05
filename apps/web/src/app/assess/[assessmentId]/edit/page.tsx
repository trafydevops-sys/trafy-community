"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import type { AssessmentForEdit, CodeLanguage, QuestionKind, Track } from "@trafy-community/core";
import { CODE_LANGUAGES } from "@trafy-community/core";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";

export default function AssessmentBuilderPage() {
  const params = useParams<{ assessmentId: string }>();
  const assessmentId = params.assessmentId;

  const [assessment, setAssessment] = useState<AssessmentForEdit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
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
  }, [assessmentId]);

  useEffect(() => {
    load();
  }, [load]);

  async function togglePublish() {
    if (!assessment) return;
    setError(null);
    try {
      await withAuthRetry(() =>
        trpc.assessments.setPublished.mutate({ assessmentId, published: !assessment.published })
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update publish status.");
    }
  }

  async function removeQuestion(questionId: string) {
    if (!assessment) return;
    setError(null);
    try {
      const remaining = assessment.questions.filter((q) => q.id !== questionId).map((q) => q.id);
      await withAuthRetry(() => trpc.assessments.setQuestions.mutate({ assessmentId, questionIds: remaining }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the question.");
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
        {assessment.published ? "Published" : "Draft"} · {assessment.track} · Layer {assessment.layer} ·{" "}
        {assessment.questionCount} question{assessment.questionCount === 1 ? "" : "s"} ·{" "}
        {assessment.timeLimitSeconds ? `${Math.round(assessment.timeLimitSeconds / 60)} min` : "45 min"}
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
      {assessment.questions.length === 0 && <p className="hint">No questions attached yet.</p>}
      {assessment.questions.map((q, i) => {
        const payload = q.payload as { options?: string[]; language?: string };
        return (
          <div className="question-card" key={q.id}>
            <span className="q-kind">
              {i + 1}. {q.kind.replace("_", " ")} · difficulty {q.difficulty}
              {payload.language ? ` · ${payload.language}` : ""}
            </span>
            <p className="q-prompt" style={{ marginTop: 6 }}>
              {q.prompt}
            </p>
            {payload.options && payload.options.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {payload.options.map((opt, oi) => (
                  <li key={oi}>{opt}</li>
                ))}
              </ul>
            )}
            <button
              className="secondary"
              style={{ alignSelf: "flex-start", marginTop: 10 }}
              onClick={() => removeQuestion(q.id)}
            >
              Remove
            </button>
          </div>
        );
      })}

      <p className="hint">
        Answer keys aren&apos;t shown here — they stay server-side so they can never reach a candidate&apos;s browser.
      </p>

      <QuestionAdder assessment={assessment} onAdded={load} />
    </AppShell>
  );
}

function QuestionAdder({ assessment, onAdded }: { assessment: AssessmentForEdit; onAdded: () => void }) {
  const [kind, setKind] = useState<QuestionKind>("single_choice");
  const [prompt, setPrompt] = useState("");
  const [difficulty, setDifficulty] = useState(1);
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [correctIndices, setCorrectIndices] = useState<number[]>([]);
  const [acceptable, setAcceptable] = useState("");
  const [language, setLanguage] = useState<CodeLanguage>("python");
  const [keywords, setKeywords] = useState("");
  const [starterCode, setStarterCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPrompt("");
    setDifficulty(1);
    setOptions(["", ""]);
    setCorrectIndex(0);
    setCorrectIndices([]);
    setAcceptable("");
    setKeywords("");
    setStarterCode("");
  }

  // Questions live in a shared bank now, so authoring is two steps: create the
  // bank question, then snapshot its id onto this assessment.
  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const base = {
        track: assessment.track as Track,
        skillTags: [] as string[],
        difficulty,
        prompt,
      };
      const cleanOptions = options.map((o) => o.trim()).filter(Boolean);

      const created = await withAuthRetry(() => {
        if (kind === "single_choice") {
          return trpc.assessments.bank.create.mutate({
            ...base,
            kind: "single_choice",
            payload: { options: cleanOptions, correctIndex },
          });
        }
        if (kind === "multi_choice") {
          return trpc.assessments.bank.create.mutate({
            ...base,
            kind: "multi_choice",
            payload: { options: cleanOptions, correctIndices },
          });
        }
        if (kind === "short_answer") {
          return trpc.assessments.bank.create.mutate({
            ...base,
            kind: "short_answer",
            payload: {
              acceptable: acceptable
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            },
          });
        }
        return trpc.assessments.bank.create.mutate({
          ...base,
          kind: "code",
          payload: {
            language,
            starterCode: starterCode || undefined,
            hiddenTestCases: [],
            keywords: keywords
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          },
        });
      });

      await withAuthRetry(() =>
        trpc.assessments.setQuestions.mutate({
          assessmentId: assessment.id,
          questionIds: [...assessment.questions.map((q) => q.id), created.id],
        })
      );

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
            <label>Difficulty (1–5)</label>
            <input
              type="number"
              min={1}
              max={5}
              value={difficulty}
              onChange={(e) => setDifficulty(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="field">
          <label>Prompt</label>
          <textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} required />
        </div>

        {(kind === "single_choice" || kind === "multi_choice") && (
          <div className="field">
            <label>Options</label>
            {options.map((opt, oi) => (
              <div key={oi} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <input
                  type={kind === "single_choice" ? "radio" : "checkbox"}
                  name="correct"
                  checked={kind === "single_choice" ? correctIndex === oi : correctIndices.includes(oi)}
                  onChange={() =>
                    kind === "single_choice"
                      ? setCorrectIndex(oi)
                      : setCorrectIndices((cur) =>
                          cur.includes(oi) ? cur.filter((x) => x !== oi) : [...cur, oi]
                        )
                  }
                />
                <input
                  value={opt}
                  onChange={(e) => setOptions((cur) => cur.map((o, idx) => (idx === oi ? e.target.value : o)))}
                  placeholder={`Option ${oi + 1}`}
                  style={{ flex: 1 }}
                />
              </div>
            ))}
            <button type="button" className="secondary" onClick={() => setOptions((cur) => [...cur, ""])}>
              Add option
            </button>
            <span className="hint"> — tick the correct answer{kind === "multi_choice" ? "s" : ""}.</span>
          </div>
        )}

        {kind === "short_answer" && (
          <div className="field">
            <label>Acceptable answers (comma separated)</label>
            <input value={acceptable} onChange={(e) => setAcceptable(e.target.value)} required />
          </div>
        )}

        {kind === "code" && (
          <>
            <div className="field">
              <label>Language</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value as CodeLanguage)}>
                {CODE_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Starter code (optional)</label>
              <textarea
                className="code-input"
                rows={4}
                value={starterCode}
                onChange={(e) => setStarterCode(e.target.value)}
                spellCheck={false}
              />
            </div>
            <div className="field">
              <label>Rubric keywords (comma separated)</label>
              <input value={keywords} onChange={(e) => setKeywords(e.target.value)} required />
              <span className="hint">
                Used to grade when Judge0 isn&apos;t configured. With JUDGE0_URL set, submissions run against real
                test cases instead.
              </span>
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
