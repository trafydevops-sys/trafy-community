import { io, type Socket } from "socket.io-client";
import { API_URL } from "./trpc-client";
import { getStoredSession } from "./session";

let socket: Socket | undefined;

/**
 * Async counterpart to apps/web/src/lib/socket.ts's getSocket() — mobile's
 * session lives in SecureStore, which is async (unlike web's synchronous
 * localStorage), so every call site here must await this. Same singleton +
 * re-auth-on-every-call pattern as web: mutate `.auth` and force a
 * reconnect so a refreshed access token propagates without a manual
 * "reconnect" step anywhere else.
 */
export async function getSocket(): Promise<Socket | null> {
  const session = await getStoredSession();
  if (!session?.accessToken) return null;

  if (!socket) {
    socket = io(API_URL, { path: "/socket.io", auth: { token: session.accessToken } });
  } else {
    socket.auth = { token: session.accessToken };
    if (!socket.connected) socket.connect();
  }
  return socket;
}

/**
 * Unlike the web app (which never calls its equivalent — see Milestone 8
 * research notes), mobile explicitly disconnects on sign-out so a stale
 * authenticated socket doesn't linger across accounts on the same device.
 */
export function disconnectSocket(): void {
  socket?.disconnect();
  socket = undefined;
}
