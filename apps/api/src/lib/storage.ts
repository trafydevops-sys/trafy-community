import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UploadKind, UploadResult } from "@trafy-community/core";
import { env, usingLocalStorage } from "./env.js";

const UPLOADS_ROOT = fileURLToPath(new URL("../../uploads", import.meta.url));

/**
 * Env-gated with a stub fallback: with no S3_ENDPOINT, uploads are written
 * to local disk under apps/api/uploads/ and served back from the API's own
 * /uploads static route. Swap in an S3-compatible client here later without
 * touching callers — they only depend on this function's signature.
 */
export async function saveUpload(
  userId: string,
  kind: UploadKind,
  file: { buffer: Buffer; filename: string; mimetype: string }
): Promise<UploadResult> {
  if (!usingLocalStorage) {
    throw new Error("S3 storage is configured but not yet implemented — see lib/storage.ts");
  }

  const dir = path.join(UPLOADS_ROOT, userId);
  await mkdir(dir, { recursive: true });

  const ext = path.extname(file.filename) || "";
  const safeName = `${kind}-${randomUUID()}${ext}`;
  await writeFile(path.join(dir, safeName), file.buffer);

  return {
    url: `${env.API_URL}/uploads/${userId}/${safeName}`,
    kind,
    sizeBytes: file.buffer.byteLength,
    contentType: file.mimetype,
  };
}
