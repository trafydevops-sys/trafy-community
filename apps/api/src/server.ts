// Must be the first import — see instrument.ts. Started via `--import` in
// package.json's dev/start/worker scripts, so this static import is really
// just documentation of the load order; the flag is what makes it real.
import "./instrument.js";
import * as Sentry from "@sentry/node";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from "@trpc/server/adapters/fastify";
import { TRPCError } from "@trpc/server";
import { fileURLToPath } from "node:url";
import { uploadKindSchema } from "@trafy-community/core";
import { env, usingDefaultCorsOrigins } from "./lib/env.js";
import { createContext } from "./lib/context.js";
import { verifyAccessToken } from "./lib/tokens.js";
import { saveUpload } from "./lib/storage.js";
import { buildDataExport } from "./lib/export.js";
import { initRealtime } from "./lib/realtime.js";
import { shutdownPostHog } from "./lib/posthog.js";
import { redis } from "./lib/redis.js";
import { corsRejection, isOriginAllowed, parseAllowedOrigins } from "./lib/security.js";
import { appRouter, type AppRouter } from "./routers/index.js";

const app = Fastify({ logger: true, trustProxy: env.TRUST_PROXY });

const allowedOrigins = parseAllowedOrigins(env.CORS_ORIGINS, env.WEB_URL);

// Before routes, per Sentry's Fastify integration (unlike Express) — captures
// framework-level errors that never reach a route handler.
Sentry.setupFastifyErrorHandler(app);

// Registered before helmet/rate-limit so that rejected requests (a 429, or a
// helmet-blocked one) still carry CORS headers — otherwise the browser hides
// the real status behind an opaque CORS failure and the web app reports the
// wrong error to the user.
await app.register(cors, {
  origin: (origin, cb) => {
    if (isOriginAllowed(origin, allowedOrigins)) return cb(null, true);
    cb(corsRejection(origin), false);
  },
});

await app.register(helmet, {
  // The web app and the API are separate origins, and avatars/certificates
  // are <img src> straight off /uploads. Helmet's same-origin default for
  // this header would break every one of those images.
  crossOriginResourcePolicy: { policy: "cross-origin" },
  // This API only ever returns JSON and user-uploaded files — it serves no
  // HTML of its own, so nothing legitimate needs to execute here. Locking
  // default-src down to 'none' is what neutralizes an uploaded .html or .svg
  // if someone navigates directly to it under the API's own origin.
  contentSecurityPolicy: {
    directives: { "default-src": ["'none'"], "frame-ancestors": ["'none'"], "sandbox": [] },
  },
});

await app.register(rateLimit, {
  max: env.RATE_LIMIT_MAX,
  timeWindow: env.RATE_LIMIT_WINDOW,
  // Shared with the rest of the app, so the counter is global across API
  // instances — an in-memory limiter would let N replicas allow N× the limit.
  redis,
  nameSpace: "ratelimit:",
  // Fail open if Redis itself is unreachable. Without this the limiter's own
  // store outage turns into a 500 on every rate-limited route — a Redis blip
  // would take the whole API down, which is strictly worse than the missing
  // limit it's meant to enforce. Verified: with Redis stopped, requests fall
  // through to their real handler instead of erroring.
  skipOnError: true,
  // Keyed by IP, which is only meaningful when TRUST_PROXY is set correctly
  // behind a load balancer — see the note on that env var.
  keyGenerator: (request) => request.ip,
  allowList: (request) => {
    const url = request.url;
    return (
      // Health checks come from the platform on a fixed interval and must
      // never be throttled — a 429 here reads as "instance is down".
      url === "/health" ||
      // Socket.IO's polling transport fires many short HTTP requests per
      // client; a normal chat session would trip the limit in under a minute.
      // The handshake verifies a JWT before any room is joined, so this path
      // is authenticated even though it isn't rate limited here.
      url.startsWith("/socket.io") ||
      // A single feed render pulls dozens of avatars/images from this route.
      // In production these live on S3/CDN and never reach the API at all.
      url.startsWith("/uploads/")
    );
  },
});

await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
await app.register(fastifyStatic, {
  root: fileURLToPath(new URL("../uploads", import.meta.url)),
  prefix: "/uploads/",
});

await app.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: {
    router: appRouter,
    createContext,
    // tRPC catches its own procedure errors and returns them as a normal
    // (non-5xx) response, so setupFastifyErrorHandler above never sees them —
    // this is the only hook that does. Only report genuinely unexpected
    // failures: expected control-flow errors (bad input, not found, a
    // deliberate FORBIDDEN/UNAUTHORIZED) would otherwise flood Sentry with
    // noise that isn't a bug.
    onError({ error, path, type }) {
      const isExpected = error instanceof TRPCError && error.code !== "INTERNAL_SERVER_ERROR";
      if (!isExpected) {
        Sentry.captureException(error, { tags: { trpcPath: path, trpcType: type } });
      }
    },
  } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
});

app.get("/health", async () => ({ ok: true, service: "trafy-community-api" }));

// Multipart file upload lives outside tRPC (streaming + tRPC don't mix well).
// Auth is checked manually here since this route isn't behind trpc's context.
app.post("/uploads/:kind", async (request, reply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Sign in required." });
  }

  let userId: string;
  try {
    const payload = await verifyAccessToken(authHeader.slice("Bearer ".length));
    userId = payload.sub;
  } catch {
    return reply.code(401).send({ error: "Invalid or expired session." });
  }

  const kindResult = uploadKindSchema.safeParse((request.params as { kind: string }).kind);
  if (!kindResult.success) {
    return reply.code(400).send({ error: "Unsupported upload kind." });
  }

  const file = await request.file();
  if (!file) {
    return reply.code(400).send({ error: "No file provided." });
  }

  const buffer = await file.toBuffer();
  const result = await saveUpload(userId, kindResult.data, {
    buffer,
    filename: file.filename,
    mimetype: file.mimetype,
  });

  return reply.send(result);
});

// Plain route, not tRPC: a zip is a binary stream, and tRPC's transport
// (JSON over HTTP, batched) has no way to return one. Auth is checked
// manually for the same reason the upload route above does it manually.
app.get("/account/export", async (request, reply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Sign in required." });
  }

  let userId: string;
  let email: string;
  try {
    const payload = await verifyAccessToken(authHeader.slice("Bearer ".length));
    userId = payload.sub;
    email = payload.email;
  } catch {
    return reply.code(401).send({ error: "Invalid or expired session." });
  }

  const archive = buildDataExport(userId, email);
  const filename = `trafy-community-export-${new Date().toISOString().slice(0, 10)}.zip`;
  reply.header("Content-Type", "application/zip");
  reply.header("Content-Disposition", `attachment; filename="${filename}"`);
  return reply.send(archive);
});

initRealtime(app.server, allowedOrigins);

app
  .listen({ port: env.API_PORT, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`trafy-community API listening on :${env.API_PORT}`);
    app.log.info("Socket.IO realtime gateway attached at /socket.io");
    app.log.info(`CORS allowed origins: ${allowedOrigins.join(", ")}`);
    if (usingDefaultCorsOrigins) {
      // Same honesty-rule callout the env-gated stubs use: say out loud which
      // fallback is active rather than letting it pass for configuration.
      app.log.warn("CORS_ORIGINS is unset — defaulting to WEB_URL only. Set it if other origins need API access.");
    }
    app.log.info(`Rate limit: ${env.RATE_LIMIT_MAX} requests per ${env.RATE_LIMIT_WINDOW} per IP`);
    if (!env.TRUST_PROXY) {
      app.log.warn("TRUST_PROXY is off — behind a load balancer every request looks like one IP and rate limiting will over-throttle.");
    }
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

// Without this, a deploy (or any SIGTERM) kills the process mid-request and
// drops whatever Sentry/PostHog events were still queued in memory — same
// class of gap as the missing graceful shutdown flagged in the production
// readiness audit.
async function shutdown(signal: string) {
  app.log.info(`${signal} received, shutting down gracefully`);
  try {
    await app.close();
    await Promise.all([Sentry.close(2000), shutdownPostHog()]);
  } finally {
    process.exit(0);
  }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
