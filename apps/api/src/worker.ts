/**
 * Background worker — run as a separate process: npm run worker -w apps/api
 * (or `npm run dev:worker` from the repo root).
 *
 * Only receives jobs when JUDGE0_URL is set — submitAnswer grades code
 * synchronously via the keyword stub and never enqueues when it isn't (see
 * apps/api/src/routers/assessments.ts).
 */
import { Worker } from "bullmq";
import { and, eq, inArray, ne } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import { computeRawScore, percentileOf, type QuestionKind } from "@trafy-community/core";
import { db } from "./lib/db.js";
import { queueConnection, type GradeCodeJob, type PlagiarismCheckJob, type FaceMatchJob, type BuildHarnessJob } from "./lib/queue.js";
import { checkSessionPlagiarism } from "./lib/plagiarism-checker.js";
import { checkFaceMatch } from "./lib/face-matcher.js";
import { generateVivaQuestions } from "./lib/viva-question-generator.js";
import { gradeViva } from "./lib/viva-grader.js";
import { gradeSubmission, type TestCase } from "./lib/judge0.js";
import { emitSessionAnswerGraded, emitSessionGraded } from "./lib/realtime.js";
import { processBuildHarness } from "./lib/build-harness.js";

const connection = queueConnection();

const gradeWorker = new Worker<GradeCodeJob>(
  "grade-code",
  async (job) => {
    const { answerId, sessionId } = job.data;
    const [answer] = await db.select().from(schema.answers).where(eq(schema.answers.id, answerId)).limit(1);
    if (!answer) return;
    const [question] = await db.select().from(schema.questionBank).where(eq(schema.questionBank.id, answer.questionId)).limit(1);
    if (!question || question.kind !== "code") return;

    const payload = question.payload as { hiddenTestCases: TestCase[]; language: string };
    const response = answer.response as { source?: string };

    const { scoreFraction } = await gradeSubmission(response.source ?? "", payload.language, payload.hiddenTestCases ?? []);

    await db
      .update(schema.answers)
      .set({ scoreFraction, correct: scoreFraction === 1, gradedAt: new Date() })
      .where(eq(schema.answers.id, answerId));
    emitSessionAnswerGraded(sessionId, { questionId: answer.questionId, scoreFraction });

    // Once every answer in the session is graded, refresh the track result
    // and finalize the session status.
    const sessionAnswers = await db.select().from(schema.answers).where(eq(schema.answers.sessionId, sessionId));
    if (sessionAnswers.some((a) => a.gradedAt === null)) return;

    const [session] = await db.select().from(schema.assessmentSessions).where(eq(schema.assessmentSessions.id, sessionId)).limit(1);
    if (!session) return;
    const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, session.assessmentId)).limit(1);
    if (!assessment) return;

    const sessionQuestions = await db
      .select({ id: schema.questionBank.id, kind: schema.questionBank.kind })
      .from(schema.questionBank)
      .where(inArray(schema.questionBank.id, sessionAnswers.map((a) => a.questionId)));
    const kindById = new Map<string, QuestionKind>(sessionQuestions.map((q) => [q.id, q.kind as QuestionKind]));

    const rawScore = computeRawScore(
      sessionAnswers.map((a) => ({ kind: kindById.get(a.questionId)!, scoreFraction: a.scoreFraction ?? 0 })),
    );

    const cohort = await db
      .select({ rawScore: schema.trackResults.rawScore })
      .from(schema.trackResults)
      .where(and(eq(schema.trackResults.track, assessment.track), ne(schema.trackResults.userId, session.userId)));
    const percentile = percentileOf(rawScore, cohort.map((c) => c.rawScore));

    await db.update(schema.trackResults).set({ rawScore, percentile }).where(eq(schema.trackResults.sessionId, sessionId));
    await db.update(schema.assessmentSessions).set({ status: "graded" }).where(eq(schema.assessmentSessions.id, sessionId));
    emitSessionGraded(sessionId, { rawScore, percentile });
  },
  { connection, concurrency: 4 },
);

console.log("Worker up: grade-code");

const plagiarismWorker = new Worker<PlagiarismCheckJob>(
  "plagiarism-check",
  async (job) => {
    await checkSessionPlagiarism(job.data.sessionId);
  },
  { connection, concurrency: 2 },
);
console.log("Worker up: plagiarism-check");

const faceMatchWorker = new Worker<FaceMatchJob>(
  "face-match",
  async (job) => {
    await checkFaceMatch(job.data.sessionId);
  },
  { connection, concurrency: 2 },
);
console.log("Worker up: face-match");

const vivaQuestionsWorker = new Worker<any>(
  "viva-questions",
  async (job) => {
    await generateVivaQuestions(job.data.vivaId, job.data.submissionId);
  },
  { connection, concurrency: 2 },
);
console.log("Worker up: viva-questions");

const vivaGradingWorker = new Worker<any>(
  "viva-grading",
  async (job) => {
    await gradeViva(job.data.vivaId);
  },
  { connection, concurrency: 2 },
);
console.log("Worker up: viva-grading");

const buildHarnessWorker = new Worker<BuildHarnessJob>(
  "build-harness",
  async (job) => {
    await processBuildHarness(job.data.submissionId);
  },
  { connection, concurrency: 2 },
);
console.log("Worker up: build-harness");

async function shutdown() {
  await Promise.all([
    gradeWorker.close(), 
    plagiarismWorker.close(), 
    faceMatchWorker.close(),
    vivaQuestionsWorker.close(),
    vivaGradingWorker.close(),
    buildHarnessWorker.close()
  ]);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
