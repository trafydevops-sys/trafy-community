import { PostHog } from "posthog-node";
import { env, usingPostHog } from "./env.js";

// Same env-gated pattern as mail.ts/storage.ts/judge0.ts: without
// POSTHOG_API_KEY, `client` stays null and every call site below no-ops
// rather than throwing — local dev needs zero PostHog project.
const client = usingPostHog
  ? new PostHog(env.POSTHOG_API_KEY!, {
      host: env.POSTHOG_HOST,
      // Server-side events are infrequent relative to a request's lifetime —
      // flush on every capture rather than batching, so nothing is lost to
      // an unflushed queue when the process exits.
      flushAt: 1,
      flushInterval: 0,
    })
  : null;

if (!usingPostHog) {
  console.warn("[posthog] POSTHOG_API_KEY not set — server-side analytics disabled (dev stub).");
}

/** Fire-and-forget server-side event capture (posthog-node queues and never
 *  throws synchronously) — analytics must never be able to break a request. */
export function capture(distinctId: string, event: string, properties?: Record<string, unknown>): void {
  client?.capture({ distinctId, event, properties });
}

export function identify(distinctId: string, properties?: Record<string, unknown>): void {
  client?.identify({ distinctId, properties });
}

export async function shutdownPostHog(): Promise<void> {
  await client?._shutdown();
}
