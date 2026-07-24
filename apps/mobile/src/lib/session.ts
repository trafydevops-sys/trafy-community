import * as SecureStore from "expo-secure-store";
import type { AuthTokens } from "@trafy-community/core";

const STORAGE_KEY = "trafy-community-session";

export type StoredSession = AuthTokens;

/**
 * Known simplification, mirroring the web client's localStorage note (see
 * apps/web/src/lib/session.ts): tokens live in SecureStore — Keychain on
 * iOS, EncryptedSharedPreferences on Android — as a single JSON blob.
 * SecureStore caps a single value at ~2048 bytes on Android, comfortably
 * above an access+refresh token pair today but worth knowing if either grows.
 */
export async function getStoredSession(): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export async function storeSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEY);
}
