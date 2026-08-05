import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Automatically captures unhandled server-side request errors (no-ops
// harmlessly if SENTRY_DSN was never set, same as everywhere else in this
// integration).
export const onRequestError = Sentry.captureRequestError;
