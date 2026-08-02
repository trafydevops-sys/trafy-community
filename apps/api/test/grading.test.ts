import { describe, expect, it } from "vitest";
import { gradeCodeStub } from "../src/lib/grading";

describe("gradeCodeStub", () => {
  it("scores the fraction of keywords present, case-insensitively", () => {
    const payload = { keywords: ["def", "return", "sorted"] };
    expect(gradeCodeStub(payload, "def solve(): return sorted([])")).toBe(1);
    expect(gradeCodeStub(payload, "def solve(): return []")).toBeCloseTo(2 / 3, 5);
  });
  it("scores 0 with no keywords present", () => {
    expect(gradeCodeStub({ keywords: ["def"] }, "x = 1")).toBe(0);
  });
  it("scores 0 with an empty keyword list", () => {
    expect(gradeCodeStub({ keywords: [] }, "anything")).toBe(0);
  });
});
