import { io, type Socket } from "socket.io-client";
import { getStoredSession } from "./session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

let socket: Socket | undefined;

/** Lazily connects a single shared Socket.IO client, re-authenticated with the current access token. */
export function getSocket(): Socket | null {
  if (typeof window === "undefined") return null;
  const token = getStoredSession()?.accessToken;
  if (!token) return null;

  if (!socket) {
    socket = io(API_URL, { path: "/socket.io", auth: { token } });
  } else {
    socket.auth = { token };
    if (!socket.connected) socket.connect();
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = undefined;
}
