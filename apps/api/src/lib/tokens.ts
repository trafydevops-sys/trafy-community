import { randomBytes, randomUUID, createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import type { AccessTokenPayload } from "@trafy-community/core";
import { env } from "./env.js";
import { db } from "./db.js";

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export async function signAccessToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ email, type: "access" satisfies AccessTokenPayload["type"] })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(env.ACCESS_TOKEN_TTL)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, accessSecret);
  if (payload.type !== "access" || typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Error("Not an access token");
  }
  return { sub: payload.sub, email: payload.email, type: "access" };
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Issues a new opaque refresh token and stores its hash. Format: `{rowId}.{secret}`. */
export async function issueRefreshToken(userId: string): Promise<string> {
  const id = randomUUID();
  const secret = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(schema.refreshTokens).values({
    id,
    userId,
    tokenHash: hashSecret(secret),
    expiresAt,
  });

  return `${id}.${secret}`;
}

/**
 * Validates a refresh token, revokes it, and returns the owning userId.
 * Callers must issue a fresh refresh token immediately (rotation) — a
 * revoked-but-presented token indicates possible theft/replay.
 */
export async function consumeRefreshToken(token: string): Promise<{ userId: string }> {
  const [id, secret] = token.split(".");
  if (!id || !secret) {
    throw new Error("Malformed refresh token");
  }

  const [row] = await db
    .select()
    .from(schema.refreshTokens)
    .where(eq(schema.refreshTokens.id, id))
    .limit(1);

  if (!row || row.revokedAt || row.expiresAt < new Date() || row.tokenHash !== hashSecret(secret)) {
    throw new Error("Invalid or expired refresh token");
  }

  await db
    .update(schema.refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(schema.refreshTokens.id, id));

  return { userId: row.userId };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const [id] = token.split(".");
  if (!id) return;
  await db
    .update(schema.refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(schema.refreshTokens.id, id));
}
