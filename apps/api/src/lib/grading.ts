import type { AnswerResponse, QuestionKind } from "@trafy-community/core";
import { usingCodeGradingStub } from "./env.js";

// The stored question, as far as grading cares about it.
export type GradableQuestion = {
  kind: QuestionKind;
  answerKey: unknown;
  points: number;
};

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === "number") : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function key(question: GradableQuestion): Record<string, unknown> {
  return (question.answerKey && typeof question.answerKey === "object" ? question.answerKey : {}) as Record<
    string,
    unknown
  >;
}

/**
 * Deterministic code grading fallback used when no JUDGE0_URL is configured:
 * fraction of the author's rubric keywords present (case-insensitive substring)
 * in the submitted source. When a Judge0 instance is wired up, replace this with
 * hidden-test-case execution — the caller only depends on the returned fraction.
 */
function gradeCodeStub(keywords: string[], source: string): number {
  if (keywords.length === 0) return 0;
  const haystack = source.toLowerCase();
  const hits = keywords.filter((kw) => haystack.includes(kw.toLowerCase())).length;
  return hits / keywords.length;
}

/** Returns a score fraction in [0, 1] for one answer. Never throws on malformed input. */
export function gradeAnswer(question: GradableQuestion, response: AnswerResponse | undefined): number {
  const k = key(question);

  switch (question.kind) {
    case "single_choice": {
      const correctIndex = typeof k.correctIndex === "number" ? k.correctIndex : -1;
      return response?.selectedIndex === correctIndex ? 1 : 0;
    }

    case "multi_choice": {
      const correct = new Set(asNumberArray(k.correctIndices));
      const selected = new Set(asNumberArray(response?.selectedIndices));
      if (correct.size === 0) return 0;
      let correctSelected = 0;
      let incorrectSelected = 0;
      for (const s of selected) {
        if (correct.has(s)) correctSelected += 1;
        else incorrectSelected += 1;
      }
      // Reward correct picks, penalize wrong picks, floor at 0.
      return Math.max(0, (correctSelected - incorrectSelected) / correct.size);
    }

    case "short_answer": {
      const acceptable = asStringArray(k.acceptable).map(normalize);
      const answer = normalize(response?.text ?? "");
      return answer.length > 0 && acceptable.includes(answer) ? 1 : 0;
    }

    case "code": {
      const keywords = asStringArray(k.keywords);
      const source = response?.source ?? "";
      // Seam: when !usingCodeGradingStub, submit `source` to Judge0 against the
      // question's hidden test cases here instead. Not implemented yet.
      void usingCodeGradingStub;
      return gradeCodeStub(keywords, source);
    }

    default:
      return 0;
  }
}
