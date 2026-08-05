import { getStoredSession } from "./session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Downloads the zip from GET /account/export and saves it via a synthetic
 * <a download>. A plain fetch + Authorization header, not tRPC — a zip is a
 * binary stream and tRPC's JSON transport can't carry one (same reasoning as
 * lib/upload.ts's direct fetch to /uploads).
 */
export async function downloadDataExport(): Promise<void> {
  const token = getStoredSession()?.accessToken;
  if (!token) throw new Error("Sign in required.");

  const res = await fetch(`${API_URL}/account/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Couldn't build your export (${res.status}).`);
  }

  const blob = await res.blob();
  const filename =
    res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
    `trafy-community-export-${new Date().toISOString().slice(0, 10)}.zip`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
