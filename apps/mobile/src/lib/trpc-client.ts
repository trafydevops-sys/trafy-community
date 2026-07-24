import { createTRPCProxyClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import Constants from "expo-constants";
import type { AppRouter } from "../../../api/src/routers/index";
import { getStoredSession, storeSession, clearSession } from "./session";

/**
 * Resolves the API base URL for the device this app is running on.
 * - EXPO_PUBLIC_API_URL wins if set (works for both simulators and devices).
 * - Otherwise, derive the dev machine's LAN IP from the Expo Go/dev-client
 *   host URI (e.g. "192.168.1.5:8081" -> "http://192.168.1.5:4000") — this
 *   is what makes "npm run dev:api" reachable from a physical phone on the
 *   same Wi-Fi without any manual IP entry.
 * - Falls back to localhost, which only works in a simulator on the same
 *   machine as the API.
 */
function resolveApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(":")[0];
  if (host) return `http://${host}:4000`;

  return "http://localhost:4000";
}

export const API_URL = resolveApiUrl();

/**
 * Same LAN-IP-derivation trick as resolveApiUrl(), but for the web app's own
 * port — used to open the LiveKit live-room page (apps/web/src/app/live)
 * in an in-app browser, since mobile has no native WebRTC modules installed.
 */
function resolveWebUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_WEB_URL;
  if (envUrl) return envUrl;

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(":")[0];
  if (host) return `http://${host}:3000`;

  return "http://localhost:3000";
}

export const WEB_URL = resolveWebUrl();

// Vanilla tRPC client (no react-query bindings), same rationale as
// apps/web/src/lib/trpc-client.ts — plain async calls + useState are enough
// for this shell's screens.
export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_URL}/trpc`,
      async headers() {
        const session = await getStoredSession();
        return session?.accessToken ? { authorization: `Bearer ${session.accessToken}` } : {};
      },
    }),
  ],
});

function isUnauthorized(err: unknown): boolean {
  return err instanceof TRPCClientError && err.data?.code === "UNAUTHORIZED";
}

/**
 * Runs a protected tRPC call, transparently refreshing the session once on
 * a 401 and retrying. Callers just get back the result or a thrown error.
 */
export async function withAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isUnauthorized(err)) throw err;

    const session = await getStoredSession();
    if (!session) throw err;

    try {
      const refreshed = await trpc.auth.refresh.mutate({ refreshToken: session.refreshToken });
      await storeSession(refreshed);
    } catch {
      await clearSession();
      throw err;
    }

    return fn();
  }
}
