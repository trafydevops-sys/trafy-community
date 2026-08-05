// instrument.ts — must load before every other module. Started via the
// `--import` flag in package.json (dev/start/worker scripts), matching this
// repo's ESM ("type": "module") convention — a plain top-of-file `import`
// inside server.ts/worker.ts would run too late for Sentry's auto
// instrumentation to attach to the modules it patches.
import * as Sentry from "@sentry/node";

// Same env-gated, graceful-fallback pattern as RESEND_API_KEY / JUDGE0_URL /
// S3_ENDPOINT: with no SENTRY_DSN, Sentry.init() below simply no-ops (every
// Sentry.* call becomes a harmless stub) — local dev needs zero Sentry
// account. dotenv is loaded here too since this file runs before env.ts's
// own `config()` call does.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

export const usingSentry = Boolean(process.env.SENTRY_DSN);

if (!usingSentry) {
  console.warn("[sentry] SENTRY_DSN not set — error tracking disabled (dev stub).");
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  includeLocalVariables: true,
  enableLogs: true,
});
