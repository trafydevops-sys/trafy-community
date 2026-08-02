/**
 * Deterministic code grading fallback used when no JUDGE0_URL is configured
 * (usingCodeGradingStub, see ./env.js): fraction of the author's rubric
 * keywords present (case-insensitive substring) in the submitted source.
 * Replaced by real Judge0 hidden-test-case execution — see
 * apps/api/src/worker.ts — once JUDGE0_URL is set.
 */
export function gradeCodeStub(payload: { keywords: string[] }, source: string): number {
  const keywords = payload.keywords ?? [];
  if (keywords.length === 0) return 0;
  const haystack = source.toLowerCase();
  const hits = keywords.filter((kw) => haystack.includes(kw.toLowerCase())).length;
  return hits / keywords.length;
}
