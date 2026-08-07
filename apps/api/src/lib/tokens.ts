import { randomBytes, randomUUID, createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { and, eq, isNull } from "drizzle-orm";
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

/**
 * Proves "the email OTP step already succeeded for this user" without yet
 * granting a session — issued by verifyOtp when the account has TOTP
 * enabled, and redeemed by verifyTotpChallenge. Deliberately short-lived and
 * a distinct `type` so it can never be mistaken for (or reused as) a real
 * access token.
 */
export async function signTotpChallengeToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ email, type: "totp_challenge" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(accessSecret);
}

export async function verifyTotpChallengeToken(token: string): Promise<{ sub: string; email: string }> {
  const { payload } = await jwtVerify(token, accessSecret);
  if (payload.type !== "totp_challenge" || typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Error("Not a valid TOTP challenge token");
  }
  return { sub: payload.sub, email: payload.email };
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

/**
 * Revokes every live refresh token for a user — used when an admin
 * suspends/bans an account, so access is cut off as soon as the current
 * (short-lived) access token expires rather than surviving via silent
 * refresh. Mirrors auth.revokeAllSessions.
 */
export async function revokeAllRefreshTokensFor(userId: string): Promise<void> {
  await db
    .update(schema.refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.refreshTokens.userId, userId), isNull(schema.refreshTokens.revokedAt)));
}
