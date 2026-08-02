import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import { db } from "../src/lib/db";
import { appRouter } from "../src/routers/index";

function callerFor(userId: string) {
  return appRouter.createCaller({ user: { sub: userId }, req: {} as never, res: {} as never });
}

describe("assessments session flow", () => {
  let userId: string;
  let questionId: string;
  let codeQuestionId: string;
  let assessmentId: string;

  beforeAll(async () => {
    // Generous timeout: this environment's Postgres container runs under
    // real memory pressure from unrelated services, so connections can be
    // slow to establish.
    const [user] = await db
      .insert(schema.users)
      .values({ email: `assess-test-${Date.now()}@example.com` })
      .returning();
    userId = user!.id;

    const caller = callerFor(userId);
    const q = await caller.assessments.bank.create({
      kind: "single_choice",
      track: "python",
      skillTags: ["basics"],
      difficulty: 1,
      prompt: "What does len([1,2,3]) return?",
      payload: { options: ["2", "3", "4"], correctIndex: 1 },
    });
    questionId = q.id;

    const codeQ = await caller.assessments.bank.create({
      kind: "code",
      track: "python",
      skillTags: ["basics"],
      difficulty: 1,
      prompt: "Write a function that returns its argument doubled.",
      payload: { language: "python", starterCode: "def double(x):\n    pass", hiddenTestCases: [], keywords: ["return", "def"] },
    });
    codeQuestionId = codeQ.id;

    const assessment = await caller.assessments.create({
      title: "Python basics",
      track: "python",
      layer: 1,
      questionIds: [questionId, codeQuestionId],
    });
    assessmentId = assessment.id;
  }, 30000);

  afterAll(async () => {
    await db.delete(schema.answers).where(eq(schema.answers.questionId, questionId));
    await db.delete(schema.answers).where(eq(schema.answers.questionId, codeQuestionId));
    await db.delete(schema.trackResults).where(eq(schema.trackResults.userId, userId));
    await db.delete(schema.assessmentSessions).where(eq(schema.assessmentSessions.userId, userId));
    await db.delete(schema.assessments).where(eq(schema.assessments.id, assessmentId));
    await db.delete(schema.questionBank).where(eq(schema.questionBank.id, questionId));
    await db.delete(schema.questionBank).where(eq(schema.questionBank.id, codeQuestionId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  });

  it("grades an MCQ session synchronously and records a track result", async () => {
    const caller = callerFor(userId);
    const { sessionId } = await caller.assessments.startSession({ assessmentId });

    const first = await caller.assessments.getNextQuestion({ sessionId, index: 0 });
    expect(first.done).toBe(false);
    if (first.done) throw new Error("unreachable");
    await caller.assessments.submitAnswer({
      sessionId,
      questionId: first.question.id,
      response: { selectedIndex: 1 },
    });

    const second = await caller.assessments.getNextQuestion({ sessionId, index: 1 });
    expect(second.done).toBe(false);
    if (second.done) throw new Error("unreachable");
    // Code question, no JUDGE0_URL in test env -> grades synchronously via the stub.
    await caller.assessments.submitAnswer({
      sessionId,
      questionId: second.question.id,
      response: { source: "def double(x):\n    return x * 2" },
    });

    const result = await caller.assessments.submitSession({ sessionId });
    expect(result.pending).toBe(false);
    expect(result.rawScore).toBeGreaterThan(0);

    const history = await caller.assessments.myHistory();
    expect(history.some((h) => h.sessionId === sessionId)).toBe(true);

    const [trackResult] = await db.select().from(schema.trackResults).where(eq(schema.trackResults.sessionId, sessionId));
    expect(trackResult).toBeDefined();
    expect(trackResult!.percentile).toBe(50); // empty cohort -> neutral 50
  }, 30000);
});
