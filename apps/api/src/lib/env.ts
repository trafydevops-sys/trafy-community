import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Root .env — this app lives two levels under the monorepo root.
config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  OTP_TTL_SECONDS: z.coerce.number().default(300),
  RESEND_API_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  JUDGE0_URL: z.string().optional(),
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  API_PORT: z.coerce.number().default(4000),
  API_URL: z.string().default("http://localhost:4000"),
  WEB_URL: z.string().default("http://localhost:3000"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Fix your .env file — see .env.example at the repo root.");
}

export const env = parsed.data;

// Honesty-rule callouts for every env-gated external dependency, matching
// the "graceful fallback" principle from the platform plan.
export const usingEmailStub = !env.RESEND_API_KEY;
export const usingLocalStorage = !env.S3_ENDPOINT;
export const usingCodeGradingStub = !env.JUDGE0_URL;
export const liveKitConfigured = Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
