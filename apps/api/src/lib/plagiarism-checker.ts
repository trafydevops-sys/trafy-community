import { schema } from "@trafy-community/db";
import { db } from "./db.js";
import { eq, and, ne } from "drizzle-orm";

function tokenize(source: string): string[] {
  // basic tokenizer: lowercase, split on non-alphanumeric
  return source.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 0);
}

function tfidfVector(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokens) {
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  // Simplified: just term frequency for now, IDF requires global corpus stats
  return counts;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (const [term, count] of a.entries()) {
    magA += count * count;
    if (b.has(term)) {
      dotProduct += count * b.get(term)!;
    }
  }

  for (const count of b.values()) {
    magB += count * count;
  }

  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
}

export async function checkSessionPlagiarism(sessionId: string) {
  // 1. Get code answers for this session
  const myAnswers = await db.select({
    id: schema.answers.id,
    questionId: schema.answers.questionId,
    response: schema.answers.response,
  }).from(schema.answers)
  .innerJoin(schema.questionBank, eq(schema.answers.questionId, schema.questionBank.id))
  .where(and(eq(schema.answers.sessionId, sessionId), eq(schema.questionBank.kind, 'code')));

  if (myAnswers.length === 0) return;

  const [session] = await db.select().from(schema.assessmentSessions).where(eq(schema.assessmentSessions.id, sessionId)).limit(1);
  if (!session) return;

  for (const answer of myAnswers) {
    const mySource = (answer.response as { source?: string }).source;
    if (!mySource || mySource.trim().length < 50) continue; // Skip very short answers

    const myTokens = tokenize(mySource);
    if (myTokens.length < 10) continue;
    const myVector = tfidfVector(myTokens);

    // 2. Load other answers for the same question
    const otherAnswers = await db.select({
      sessionId: schema.answers.sessionId,
      userId: schema.assessmentSessions.userId,
      response: schema.answers.response,
    }).from(schema.answers)
    .innerJoin(schema.assessmentSessions, eq(schema.answers.sessionId, schema.assessmentSessions.id))
    .where(and(
      eq(schema.answers.questionId, answer.questionId),
      ne(schema.answers.sessionId, sessionId)
    ));

    for (const other of otherAnswers) {
      const otherSource = (other.response as { source?: string }).source;
      if (!otherSource) continue;

      const otherVector = tfidfVector(tokenize(otherSource));
      const similarity = cosineSimilarity(myVector, otherVector);

      if (similarity > 0.85) {
        // Flag both
        const severity = similarity > 0.95 ? 'critical' : 'warning';
        
        await db.insert(schema.integrityFlags).values({
          sessionId: sessionId,
          userId: session.userId,
          kind: 'plagiarism',
          severity: severity,
          detail: {
            questionId: answer.questionId,
            similarSessionId: other.sessionId,
            similarity: Math.round(similarity * 100),
          },
          visible: true,
          resolution: 'pending',
        });

        await db.insert(schema.integrityFlags).values({
          sessionId: other.sessionId,
          userId: other.userId,
          kind: 'plagiarism',
          severity: severity,
          detail: {
            questionId: answer.questionId,
            similarSessionId: sessionId,
            similarity: Math.round(similarity * 100),
          },
          visible: true,
          resolution: 'pending',
        });
      }
    }
  }
}
