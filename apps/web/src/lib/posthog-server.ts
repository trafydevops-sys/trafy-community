import { PostHog } from "posthog-node";

let client: PostHog | null | undefined;

/** Lazily created, env-gated like every other external dependency in this
 *  codebase — returns null (all calls become no-ops) with no PostHog project
 *  configured. Most of this app's tRPC-backed data fetching runs through
 *  apps/api, which has its own server-side client (apps/api/src/lib/posthog.ts);
 *  this one is for the few things that run in the Next.js server runtime itself
 *  (route handlers, middleware). */
export function getPostHogClient(): PostHog | null {
  if (client !== undefined) return client;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  client = key
    ? new PostHog(key, {
        host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
        flushAt: 1,
        flushInterval: 0,
      })
    : null;
  return client;
}

export async function shutdownPostHog(): Promise<void> {
  await client?._shutdown();
}
