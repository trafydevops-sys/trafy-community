// instrumentation-client.ts — the Next.js 15.3+ location for client-runtime
// init. Never combine this with a separate PostHogProvider/other client init
// approach; this file is the single source of truth for browser-side setup.
import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

// Same env-gated, graceful-fallback convention as the rest of this codebase
// (RESEND_API_KEY / JUDGE0_URL / S3_ENDPOINT): with no DSN or token, both
// SDKs quietly no-op — local dev needs zero Sentry/PostHog account.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    enableLogs: true,
    integrations: [Sentry.replayIntegration()],
  });
} else if (process.env.NODE_ENV === "development") {
  console.warn("[sentry] NEXT_PUBLIC_SENTRY_DSN not set — client error tracking disabled (dev stub).");
}

if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    // Proxied through next.config.ts rewrites so ad blockers don't strip
    // first-party analytics calls.
    api_host: "/ingest",
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.posthog.com",
    defaults: "2026-01-30",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
  });
} else if (process.env.NODE_ENV === "development") {
  console.warn("[posthog] NEXT_PUBLIC_POSTHOG_KEY not set — client analytics disabled (dev stub).");
}

// Hook into App Router navigation transitions for Sentry's tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
