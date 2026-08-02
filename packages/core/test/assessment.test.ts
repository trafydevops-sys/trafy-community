import { describe, expect, it } from "vitest";
import {
  ASSESSMENT_BLUEPRINT,
  QUESTION_KINDS,
  buildSessionPlan,
  computeRawScore,
  gradeMultiChoice,
  gradeShortAnswer,
  gradeSingleChoice,
  gradeSyncAnswer,
  isAsyncGraded,
  toSafePayload,
  type MultiChoicePayload,
  type ShortAnswerPayload,
  type SingleChoicePayload,
} from "../src/assessment";

describe("gradeSingleChoice", () => {
  const payload: SingleChoicePayload = { options: ["a", "b", "c"], correctIndex: 1 };
  it("scores 1 on the correct index", () => {
    expect(gradeSingleChoice(payload, { selectedIndex: 1 })).toEqual({ correct: true, scoreFraction: 1 });
  });
  it("scores 0 on a wrong index", () => {
    expect(gradeSingleChoice(payload, { selectedIndex: 0 })).toEqual({ correct: false, scoreFraction: 0 });
  });
  it("scores 0 on a missing response", () => {
    expect(gradeSingleChoice(payload, {})).toEqual({ correct: false, scoreFraction: 0 });
  });
});

describe("gradeMultiChoice", () => {
  const payload: MultiChoicePayload = { options: ["a", "b", "c", "d"], correctIndices: [0, 2] };
  it("scores 1 on an exact match regardless of order", () => {
    expect(gradeMultiChoice(payload, { selectedIndices: [2, 0] }).scoreFraction).toBe(1);
  });
  it("gives partial credit for a partially-correct selection", () => {
    const r = gradeMultiChoice(payload, { selectedIndices: [0] });
    expect(r.scoreFraction).toBe(0.5);
    expect(r.correct).toBe(false);
  });
  it("penalizes false positives via Jaccard", () => {
    const r = gradeMultiChoice(payload, { selectedIndices: [0, 1, 2, 3] });
    expect(r.scoreFraction).toBe(0.5);
  });
  it("scores 0 on an empty selection", () => {
    expect(gradeMultiChoice(payload, { selectedIndices: [] }).scoreFraction).toBe(0);
  });
});

describe("gradeShortAnswer", () => {
  const payload: ShortAnswerPayload = { acceptable: ["Paris"] };
  it("matches case-insensitively and trims by default", () => {
    expect(gradeShortAnswer(payload, { text: "  paris  " }).correct).toBe(true);
  });
  it("rejects wrong answers", () => {
    expect(gradeShortAnswer(payload, { text: "London" }).correct).toBe(false);
  });
  it("respects caseSensitive: true", () => {
    const strict: ShortAnswerPayload = { acceptable: ["Paris"], caseSensitive: true };
    expect(gradeShortAnswer(strict, { text: "paris" }).correct).toBe(false);
    expect(gradeShortAnswer(strict, { text: "Paris" }).correct).toBe(true);
  });
});

describe("isAsyncGraded / gradeSyncAnswer", () => {
  it("code is async and returns null from gradeSyncAnswer", () => {
    expect(isAsyncGraded("code")).toBe(true);
    expect(
      gradeSyncAnswer("code", { language: "python", keywords: ["def"], hiddenTestCases: [] }, {}),
    ).toBeNull();
  });
  it("non-code kinds are sync", () => {
    expect(isAsyncGraded("single_choice")).toBe(false);
    expect(isAsyncGraded("multi_choice")).toBe(false);
    expect(isAsyncGraded("short_answer")).toBe(false);
  });
});

describe("toSafePayload", () => {
  it("strips the answer key from choice kinds", () => {
    const safe = toSafePayload("single_choice", { options: ["a", "b"], correctIndex: 0 });
    expect(safe).toEqual({ options: ["a", "b"] });
    expect(safe).not.toHaveProperty("correctIndex");
  });
  it("strips acceptable answers from short_answer", () => {
    expect(toSafePayload("short_answer", { acceptable: ["x"] })).toEqual({});
  });
  it("strips hiddenTestCases and keywords from code", () => {
    const safe = toSafePayload("code", {
      language: "python",
      starterCode: "def solve(): pass",
      hiddenTestCases: [{ input: "1", expected: "1" }],
      keywords: ["def", "return"],
    });
    expect(safe).toEqual({ language: "python", starterCode: "def solve(): pass" });
  });
});

describe("buildSessionPlan", () => {
  it("selects exactly the blueprint count per kind when the pool is large enough", () => {
    const pool: Record<string, string[]> = {};
    for (const kind of QUESTION_KINDS) {
      pool[kind] = Array.from({ length: 20 }, (_, i) => `${kind}-${i}`);
    }
    const plan = buildSessionPlan(pool);
    const total = Object.values(ASSESSMENT_BLUEPRINT).reduce((a, b) => a + b, 0);
    expect(plan).toHaveLength(total);
    const all = new Set(Object.values(pool).flat());
    expect(plan.every((id) => all.has(id))).toBe(true);
  });

  it("degrades gracefully when a kind has fewer questions than the blueprint wants", () => {
    const plan = buildSessionPlan({ single_choice: ["a", "b"], multi_choice: [], short_answer: [], code: [] });
    expect(plan).toHaveLength(2); // blueprint wants 4, only 2 exist
  });

  it("returns an empty plan when no pools are provided", () => {
    expect(buildSessionPlan({})).toEqual([]);
  });

  it("is deterministic given a fixed rng", () => {
    const pool = { single_choice: ["a", "b", "c", "d", "e"] };
    const rng = () => 0.4;
    const blueprint = { single_choice: 3, multi_choice: 0, short_answer: 0, code: 0 };
    const a = buildSessionPlan(pool, blueprint, rng);
    const b = buildSessionPlan(pool, blueprint, rng);
    expect(a).toEqual(b);
  });
});

describe("computeRawScore", () => {
  it("returns 0 for no graded answers", () => {
    expect(computeRawScore([])).toBe(0);
  });
  it("weights harder kinds more heavily", () => {
    const allCorrectEasy = computeRawScore([
      { kind: "single_choice", scoreFraction: 1 },
      { kind: "single_choice", scoreFraction: 1 },
    ]);
    expect(allCorrectEasy).toBe(1);

    const mixedWeighted = computeRawScore([
      { kind: "single_choice", scoreFraction: 1 }, // weight 1
      { kind: "code", scoreFraction: 0 }, // weight 2
    ]);
    expect(mixedWeighted).toBeCloseTo(1 / 3, 5);
  });
});
