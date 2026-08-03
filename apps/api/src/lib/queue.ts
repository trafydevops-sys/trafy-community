import { Queue } from "bullmq";
import { env } from "./env.js";

function connection() {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    tls: url.protocol === "rediss:" ? {} : undefined, // Upstash requires TLS on rediss://
  };
}

/** Producer-only connection (API side). Fails fast instead of hanging when
 *  Redis is unreachable: ioredis's default retryStrategy retries forever,
 *  and BullMQ's internal waitUntilReady() blocks on that regardless of
 *  enableOfflineQueue — so the retry count itself must be bounded. NEVER use
 *  this for a Worker/QueueEvents — BullMQ requires maxRetriesPerRequest: null
 *  on those blocking connections (see queueConnection). */
function producerConnection() {
  return {
    ...connection(),
    enableOfflineQueue: false,
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
    retryStrategy: (times: number) => (times > 2 ? null : 150),
  };
}

export type GradeCodeJob = { answerId: string; sessionId: string };
export type PlagiarismCheckJob = { sessionId: string };
export type FaceMatchJob = { sessionId: string };
export type VivaQuestionsJob = { vivaId: string; submissionId: string };
export type VivaGradingJob = { vivaId: string };
export type BuildHarnessJob = { submissionId: string };

let queues: { 
  gradeCode: Queue<GradeCodeJob>;
  plagiarismCheck: Queue<PlagiarismCheckJob>;
  faceMatch: Queue<FaceMatchJob>;
  vivaQuestions: Queue<VivaQuestionsJob>;
  vivaGrading: Queue<VivaGradingJob>;
  buildHarness: Queue<BuildHarnessJob>;
} | null = null;

export function getQueues() {
  if (!queues) {
    queues = {
      gradeCode: new Queue<GradeCodeJob>("grade-code", {
        connection: producerConnection(),
        defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
      }),
      plagiarismCheck: new Queue<PlagiarismCheckJob>("plagiarism-check", {
        connection: producerConnection(),
        defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
      }),
      faceMatch: new Queue<FaceMatchJob>("face-match", {
        connection: producerConnection(),
        defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
      }),
      vivaQuestions: new Queue<VivaQuestionsJob>("viva-questions", {
        connection: producerConnection(),
        defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
      }),
      vivaGrading: new Queue<VivaGradingJob>("viva-grading", {
        connection: producerConnection(),
        defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
      }),
      buildHarness: new Queue<BuildHarnessJob>("build-harness", {
        connection: producerConnection(),
        defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
      }),
    };
  }
  return queues;
}

/** For Worker/QueueEvents (consumer side) — do not add retry/offline-queue
 *  overrides here; BullMQ requires maxRetriesPerRequest: null on those. */
export const queueConnection = connection;

/** Best-effort enqueue: warns and resolves instead of throwing/hanging when
 *  Redis is unreachable (e.g. local dev without Redis running). The job
 *  simply never gets queued — the caller's data stays in its pending state
 *  until Redis + a worker are available. */
export async function tryEnqueue(job: Promise<unknown>, label: string): Promise<void> {
  try {
    await job;
  } catch (err) {
    console.warn(`[queue] could not enqueue ${label} (Redis unavailable?):`, (err as Error).message);
  }
}
