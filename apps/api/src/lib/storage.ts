import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { UploadKind, UploadResult } from "@trafy-community/core";
import { env, usingLocalStorage } from "./env.js";

const UPLOADS_ROOT = fileURLToPath(new URL("../../uploads", import.meta.url));

export type S3Config = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  forcePathStyle: boolean;
  publicUrl?: string;
};

/** Pure — no module-level singletons, no I/O. Safe to unit test directly
 *  with a plain object, no mocking required. */
export function requireS3Config(env: {
  S3_ENDPOINT?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_REGION?: string;
  S3_FORCE_PATH_STYLE?: boolean;
  S3_PUBLIC_URL?: string;
}): S3Config {
  if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    // Fail fast and specifically, not with a generic SDK error three calls
    // deep — S3_ENDPOINT alone isn't a complete config.
    throw new Error(
      "S3_ENDPOINT is set but S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are missing — " +
        "set all four (see .env.example) or unset S3_ENDPOINT to fall back to local disk."
    );
  }
  return {
    endpoint: env.S3_ENDPOINT!,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    region: env.S3_REGION ?? "auto",
    forcePathStyle: env.S3_FORCE_PATH_STYLE ?? true,
    publicUrl: env.S3_PUBLIC_URL,
  };
}

/** Pure. e.g. https://accountid.r2.cloudflarestorage.com + trafy-uploads/abc
 *  -> https://accountid.r2.cloudflarestorage.com/trafy-uploads/abc, or the
 *  configured public/CDN host in front of the bucket when set. */
export function publicUrlFor(config: S3Config, key: string): string {
  const host = config.publicUrl ?? `${config.endpoint}/${config.bucket}`;
  return `${host.replace(/\/$/, "")}/${key}`;
}

let s3: S3Client | null = null;
let s3Config: S3Config | null = null;

function getS3Client(config: S3Config): S3Client {
  // Rebuild only if config actually changed (relevant for tests; in a real
  // process env vars are read once and never change).
  if (s3 && s3Config === config) return s3;
  s3 = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  s3Config = config;
  return s3;
}

/**
 * Env-gated with a stub fallback: with no S3_ENDPOINT, uploads are written
 * to local disk under apps/api/uploads/ and served back from the API's own
 * /uploads static route — fine for a single dev instance, but the files
 * don't survive a redeploy and don't work across multiple instances. With
 * S3_ENDPOINT (+ S3_BUCKET/keys) set, uploads go to S3-compatible storage
 * instead (AWS S3, Cloudflare R2, DigitalOcean Spaces, Backblaze B2,
 * self-hosted MinIO, ...) — callers only depend on this function's
 * signature and never see the difference.
 */
export async function saveUpload(
  userId: string,
  kind: UploadKind,
  file: { buffer: Buffer; filename: string; mimetype: string }
): Promise<UploadResult> {
  const ext = path.extname(file.filename) || "";
  const safeName = `${kind}-${randomUUID()}${ext}`;

  if (usingLocalStorage) {
    const dir = path.join(UPLOADS_ROOT, userId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, safeName), file.buffer);

    return {
      url: `${env.API_URL}/uploads/${userId}/${safeName}`,
      kind,
      sizeBytes: file.buffer.byteLength,
      contentType: file.mimetype,
    };
  }

  const config = requireS3Config(env);
  const key = `${userId}/${safeName}`;
  await getS3Client(config).send(
    new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: file.buffer, ContentType: file.mimetype })
  );

  return {
    url: publicUrlFor(config, key),
    kind,
    sizeBytes: file.buffer.byteLength,
    contentType: file.mimetype,
  };
}
