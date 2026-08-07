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
  // S3-compatible object storage (AWS S3, Cloudflare R2, DigitalOcean Spaces,
  // Backblaze B2, self-hosted MinIO, ...) — see lib/storage.ts.
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  // Most S3-compatible providers (R2, MinIO, Spaces) serve files back through
  // a URL that differs from the API endpoint used to write them (a public
  // bucket subdomain, or a CDN in front of the bucket). Falls back to
  // path-style off the endpoint itself when unset — correct for AWS S3, not
  // for providers that require a separate public host.
  S3_PUBLIC_URL: z.string().optional(),
  // MinIO and most non-AWS providers require path-style addressing
  // (endpoint/bucket/key) rather than AWS's virtual-hosted style
  // (bucket.endpoint/key).
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  JUDGE0_URL: z.string().optional(),
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  API_PORT: z.coerce.number().default(4000),
  API_URL: z.string().default("http://localhost:4000"),
  WEB_URL: z.string().default("http://localhost:3000"),
  // Comma-separated browser origins allowed to call this API. Unset falls
  // back to WEB_URL alone — see lib/security.ts.
  CORS_ORIGINS: z.string().optional(),
  // Behind a load balancer (Fly, Render, ALB, nginx) the socket peer is the
  // proxy, so every caller shares one req.ip and the rate limiter below would
  // throttle all users as if they were one. Turn this on only when a trusted
  // proxy really is in front — it makes the API believe X-Forwarded-For,
  // which a direct-to-internet deploy would let anyone forge.
  TRUST_PROXY: z.coerce.boolean().default(false),
  RATE_LIMIT_MAX: z.coerce.number().default(300),
  RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),
  // Sentry itself is initialized in instrument.ts (must load before every
  // other module) — SENTRY_DSN is read there directly from process.env, not
  // through this schema. It's listed here only so `usingSentry` below can
  // read the same value everyone else's env access goes through.
  SENTRY_DSN: z.string().optional(),
  POSTHOG_API_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().default("https://us.i.posthog.com"),
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
export const usingSentry = Boolean(env.SENTRY_DSN);
export const usingPostHog = Boolean(env.POSTHOG_API_KEY);
export const usingDefaultCorsOrigins = !env.CORS_ORIGINS;
