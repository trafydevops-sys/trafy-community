import { describe, expect, it } from "vitest";
import { computeTrafyPoints, decayFactor, percentileOf, type TrackResult } from "../src/scoring";

const NOW = new Date("2026-07-01T00:00:00Z");

function result(track: TrackResult["track"], percentile: number, monthsAgo = 0): TrackResult {
  const earnedAt = new Date(NOW);
  earnedAt.setUTCDate(earnedAt.getUTCDate() - Math.round(monthsAgo * 30.44));
  return { track, percentile, earnedAt };
}

describe("decayFactor", () => {
  it("is 1 within 12 months", () => {
    expect(decayFactor(result("python", 90, 0).earnedAt, NOW)).toBe(1);
    expect(decayFactor(result("python", 90, 11.9).earnedAt, NOW)).toBe(1);
  });
  it("is 0 at or beyond 18 months", () => {
    expect(decayFactor(result("python", 90, 18.1).earnedAt, NOW)).toBe(0);
    expect(decayFactor(result("python", 90, 36).earnedAt, NOW)).toBe(0);
  });
  it("decays linearly between 12 and 18 months", () => {
    const f = decayFactor(result("python", 90, 15).earnedAt, NOW);
    expect(f).toBeGreaterThan(0.4);
    expect(f).toBeLessThan(0.6);
  });
});

describe("computeTrafyPoints", () => {
  it("returns 0 for no results", () => {
    expect(computeTrafyPoints([], NOW)).toBe(0);
  });
  it("equals the single percentile for one fresh track", () => {
    expect(computeTrafyPoints([result("python", 80)], NOW)).toBe(80);
  });
  it("rewards depth: strongest track dominates", () => {
    const pts = computeTrafyPoints([result("python", 90), result("frontend", 30)], NOW);
    expect(pts).toBe(70); // (90 + 15) / 1.5
  });
  it("uses the best result per track, not duplicates", () => {
    const pts = computeTrafyPoints([result("python", 60), result("python", 90)], NOW);
    expect(pts).toBe(90);
  });
  it("stale results pull the score down via decay", () => {
    const fresh = computeTrafyPoints([result("python", 90, 1)], NOW);
    const stale = computeTrafyPoints([result("python", 90, 17)], NOW);
    expect(fresh).toBe(90);
    expect(stale).toBeLessThan(20);
  });
});

describe("percentileOf", () => {
  it("handles empty cohort with neutral 50", () => {
    expect(percentileOf(10, [])).toBe(50);
  });
  it("computes inclusive rank percentile", () => {
    expect(percentileOf(30, [10, 20, 30, 40])).toBe(62.5);
    expect(percentileOf(41, [10, 20, 30, 40])).toBe(100);
  });
});
