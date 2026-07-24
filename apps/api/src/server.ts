import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { fileURLToPath } from "node:url";
import { uploadKindSchema } from "@trafy-community/core";
import { env } from "./lib/env.js";
import { createContext } from "./lib/context.js";
import { verifyAccessToken } from "./lib/tokens.js";
import { saveUpload } from "./lib/storage.js";
import { initRealtime } from "./lib/realtime.js";
import { appRouter } from "./routers/index.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
await app.register(fastifyStatic, {
  root: fileURLToPath(new URL("../uploads", import.meta.url)),
  prefix: "/uploads/",
});

await app.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: { router: appRouter, createContext },
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
