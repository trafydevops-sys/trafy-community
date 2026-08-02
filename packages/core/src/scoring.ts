import type { TrackResult } from "./types.js";

/**
 * Trafy Points — the single 0-100 number companies see.
 *
 * Model:
 *  - each track result is a cohort percentile (0-100)
 *  - results decay linearly to 0 between DECAY_START_MONTHS and DECAY_END_MONTHS
 *  - the composite is a weighted mean that rewards depth over breadth:
 *    tracks are sorted by decayed score and weighted 1, 1/2, 1/3, ... so a
 *    talent's strongest skills dominate but extra tracks still help.
 */

export const DECAY_START_MONTHS = 12;
export const DECAY_END_MONTHS = 18;

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;

export function monthsBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / MS_PER_MONTH);
}

/** Multiplier in [0,1] applied to a result based on its age. */
export function decayFactor(earnedAt: Date, now: Date = new Date()): number {
  const age = monthsBetween(earnedAt, now);
  if (age <= DECAY_START_MONTHS) return 1;
  if (age >= DECAY_END_MONTHS) return 0;
  return 1 - (age - DECAY_START_MONTHS) / (DECAY_END_MONTHS - DECAY_START_MONTHS);
}

export function decayedScore(result: TrackResult, now: Date = new Date()): number {
  return result.percentile * decayFactor(result.earnedAt, now);
}

/** Composite Trafy Points across all of a talent's track results. */
export function computeTrafyPoints(results: TrackResult[], now: Date = new Date()): number {
  if (results.length === 0) return 0;
  const bestPerTrack = new Map<string, number>();
  for (const r of results) {
    const s = decayedScore(r, now);
    const prev = bestPerTrack.get(r.track);
    if (prev === undefined || s > prev) bestPerTrack.set(r.track, s);
  }
  const sorted = [...bestPerTrack.values()].sort((a, b) => b - a);
  let weighted = 0;
  let weightSum = 0;
  for (let i = 0; i < sorted.length; i++) {
    const w = 1 / (i + 1);
    weighted += (sorted[i] ?? 0) * w;
    weightSum += w;
  }
  return Math.round((weighted / weightSum) * 10) / 10;
}

/** Percentile of a raw score within a cohort of raw scores (inclusive rank). */
export function percentileOf(raw: number, cohort: number[]): number {
  if (cohort.length === 0) return 50;
  const below = cohort.filter((c) => c < raw).length;
  const equal = cohort.filter((c) => c === raw).length;
  return Math.round(((below + equal * 0.5) / cohort.length) * 1000) / 10;
}
