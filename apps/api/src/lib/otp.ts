import { createHash, randomInt } from "node:crypto";
import { redis } from "./redis.js";
import { env } from "./env.js";

const CODE_KEY = (email: string) => `otp:code:${email}`;
const RATE_KEY = (email: string) => `otp:rate:${email}`;
const MAX_REQUESTS_PER_WINDOW = 5;
const RATE_WINDOW_SECONDS = 15 * 60;
const MAX_VERIFY_ATTEMPTS = 5;
const ATTEMPTS_KEY = (email: string) => `otp:attempts:${email}`;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Throws if the email has requested too many OTPs recently. */
export async function checkRequestRateLimit(email: string): Promise<void> {
  const key = RATE_KEY(email);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, RATE_WINDOW_SECONDS);
  }
  if (count > MAX_REQUESTS_PER_WINDOW) {
    throw new Error("Too many OTP requests — please try again later.");
  }
}

export async function storeOtpCode(email: string, code: string): Promise<void> {
  await redis.set(CODE_KEY(email), hashCode(code), "EX", env.OTP_TTL_SECONDS);
  await redis.del(ATTEMPTS_KEY(email));
}

/** Verifies the code, consuming it on success. Throws on mismatch/expiry/too-many-attempts. */
export async function verifyAndConsumeOtpCode(email: string, code: string): Promise<void> {
  const attemptsKey = ATTEMPTS_KEY(email);
  const attempts = await redis.incr(attemptsKey);
  if (attempts === 1) {
    await redis.expire(attemptsKey, env.OTP_TTL_SECONDS);
  }
  if (attempts > MAX_VERIFY_ATTEMPTS) {
    await redis.del(CODE_KEY(email));
    throw new Error("Too many incorrect attempts — request a new code.");
  }

  const stored = await redis.get(CODE_KEY(email));
  if (!stored || stored !== hashCode(code)) {
    throw new Error("Incorrect or expired code.");
  }

  await redis.del(CODE_KEY(email), attemptsKey);
}
