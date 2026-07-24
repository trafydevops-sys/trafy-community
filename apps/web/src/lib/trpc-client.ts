import { createTRPCProxyClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import type { AppRouter } from "../../../api/src/routers/index";
import { getStoredSession, storeSession, clearSession } from "./session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Vanilla tRPC client (no react-query bindings) — Milestone 1's forms are
// simple enough that plain async calls + useState cover it, and it sidesteps
// any @trpc/react-query <-> React 19 peer-dependency churn.
export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_URL}/trpc`,
      headers() {
        const token = getStoredSession()?.accessToken;
        return token ? { authorization: `Bearer ${token}` } : {};
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

    const session = getStoredSession();
    if (!session) throw err;

    try {
      const refreshed = await trpc.auth.refresh.mutate({ refreshToken: session.refreshToken });
      storeSession(refreshed);
    } catch {
      clearSession();
      throw err;
    }

    return fn();
  }
}
