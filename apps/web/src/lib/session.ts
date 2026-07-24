import type { AuthTokens } from "@trafy-community/core";

const STORAGE_KEY = "trafy-community.session";

export type StoredSession = AuthTokens;

/**
 * Known simplification for this milestone: the access + refresh tokens live
 * in localStorage, readable by any script on the page. Good enough to build
 * and demo the auth flow; before shipping, move the refresh token to an
 * httpOnly cookie set by the API and keep only the short-lived access token
 * in memory (see docs/trafy-mobile-shared-backend.png for the mobile
 * equivalent — Keychain / EncryptedSharedPreferences).
 */
export function getStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function storeSession(session: StoredSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event("trafy-community:session-changed"));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("trafy-community:session-changed"));
}
