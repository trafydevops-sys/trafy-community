import type { UploadKind, UploadResult } from "@trafy-community/core";
import { getStoredSession } from "./session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function uploadFile(kind: UploadKind, file: File): Promise<UploadResult> {
  const token = getStoredSession()?.accessToken;
  if (!token) throw new Error("Sign in required.");

  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_URL}/uploads/${kind}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Upload failed (${res.status})`);
  }

  return res.json() as Promise<UploadResult>;
}
