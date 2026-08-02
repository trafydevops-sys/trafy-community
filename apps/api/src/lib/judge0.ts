/**
 * Judge0 CE client — executes untrusted assessment code against hidden test
 * cases. Self-hosted via `docker compose --profile sandbox up -d` (add this
 * profile to docker-compose.yml if it isn't there yet).
 */
import { env } from "./env.js";

const JUDGE0_URL = () => env.JUDGE0_URL ?? "http://localhost:2358";

/** Language name (stored on questions) -> Judge0 language id. */
export const JUDGE0_LANGUAGES: Record<string, number> = {
  python: 71,
  javascript: 63,
  typescript: 74,
  go: 60,
  java: 62,
  cpp: 54,
};

export type TestCase = { input: string; expected: string };

export type CaseResult = {
  passed: boolean;
  stdout: string | null;
  stderr: string | null;
  statusDescription: string;
};

type Judge0Submission = {
  stdout: string | null;
  stderr: string | null;
  status: { id: number; description: string };
};

/** Run one source file against one test case (synchronous wait mode). */
export async function runCase(
  source: string,
  language: string,
  testCase: TestCase,
  timeoutMs = 15_000,
): Promise<CaseResult> {
  const languageId = JUDGE0_LANGUAGES[language];
  if (!languageId) throw new Error(`Unsupported language: ${language}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${JUDGE0_URL()}/submissions?wait=true&base64_encoded=false`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        source_code: source,
        language_id: languageId,
        stdin: testCase.input,
        expected_output: testCase.expected,
        cpu_time_limit: 5,
        memory_limit: 256_000,
      }),
    });
    if (!res.ok) throw new Error(`Judge0 ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as Judge0Submission;
    return {
      passed: data.status.id === 3, // 3 = Accepted (output matched expected_output)
      stdout: data.stdout,
      stderr: data.stderr,
      statusDescription: data.status.description,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Grade a submission: fraction of hidden test cases passed. */
export async function gradeSubmission(
  source: string,
  language: string,
  testCases: TestCase[],
): Promise<{ scoreFraction: number; results: CaseResult[] }> {
  if (testCases.length === 0) return { scoreFraction: 0, results: [] };
  const results: CaseResult[] = [];
  for (const tc of testCases) {
    results.push(await runCase(source, language, tc));
  }
  const passed = results.filter((r) => r.passed).length;
  return { scoreFraction: passed / testCases.length, results };
}
