import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import type { AccessTokenPayload } from "@trafy-community/core";
import { verifyAccessToken } from "./tokens.js";
import { db } from "./db.js";

export async function createContext({ req }: CreateFastifyContextOptions) {
  let user: AccessTokenPayload | null = null;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      user = await verifyAccessToken(authHeader.slice("Bearer ".length));
    } catch {
      user = null; // expired/invalid token — protectedProcedure will reject if required
    }
  }

  return { user, db };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
