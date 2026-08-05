// Must be the first import — see instrument.ts. Started via `--import` in
// package.json's dev/start/worker scripts, so this static import is really
// just documentation of the load order; the flag is what makes it real.
import "./instrument.js";
import * as Sentry from "@sentry/node";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from "@trpc/server/adapters/fastify";
import { TRPCError } from "@trpc/server";
import { fileURLToPath } from "node:url";
import { uploadKindSchema } from "@trafy-community/core";
import { env } from "./lib/env.js";
import { createContext } from "./lib/context.js";
import { verifyAccessToken } from "./lib/tokens.js";
import { saveUpload } from "./lib/storage.js";
import { initRealtime } from "./lib/realtime.js";
import { shutdownPostHog } from "./lib/posthog.js";
import { appRouter, type AppRouter } from "./routers/index.js";

const app = Fastify({ logger: true });

// Before routes, per Sentry's Fastify integration (unlike Express) — captures
// framework-level errors that never reach a route handler.
Sentry.setupFastifyErrorHandler(app);

await app.register(cors, { origin: true });
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

initRealtime(app.server);

app
  .listen({ port: env.API_PORT, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`trafy-community API listening on :${env.API_PORT}`);
    app.log.info("Socket.IO realtime gateway attached at /socket.io");
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
