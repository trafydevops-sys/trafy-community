import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import type { SocketMessageEvent, SocketTypingEvent } from "@trafy-community/core";
import type { Notification } from "@trafy-community/core";
import { verifyAccessToken } from "./tokens.js";

let io: Server | undefined;

export function initRealtime(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: true },
    path: "/socket.io",
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Sign in required."));
    try {
      const payload = await verifyAccessToken(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error("Invalid or expired session."));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;
    // Personal room for notification pushes — see notifications.ts.
    socket.join(`user:${userId}`);

    socket.on("channel:join", (channelId: string) => {
      socket.join(`channel:${channelId}`);
    });
    socket.on("channel:leave", (channelId: string) => {
      socket.leave(`channel:${channelId}`);
    });
    socket.on("typing", (payload: { channelId: string; typing: boolean }) => {
      const event: SocketTypingEvent = { channelId: payload.channelId, userId, typing: payload.typing };
      socket.to(`channel:${payload.channelId}`).emit("typing", event);
    });

    // Assessment runner: candidate joins their own session's room to
    // receive live grading updates (session:answer-graded, session:graded).
    socket.on("session:join", (sessionId: string) => {
      socket.join(`session:${sessionId}`);
    });
    socket.on("session:leave", (sessionId: string) => {
      socket.leave(`session:${sessionId}`);
    });

    // Recruiter/proctor view: joins to receive integrity:flag events for a
    // specific assessment while candidates are actively taking it.
    socket.on("assessment:live:join", (assessmentId: string) => {
      socket.join(`assessment:${assessmentId}:live`);
    });
    socket.on("assessment:live:leave", (assessmentId: string) => {
      socket.leave(`assessment:${assessmentId}:live`);
    });
  });

  return io;
}

export function emitNewMessage(event: SocketMessageEvent): void {
  io?.to(`channel:${event.channelId}`).emit("message:new", event);
}

export function emitNotification(userId: string, notification: Notification): void {
  io?.to(`user:${userId}`).emit("notification:new", notification);
}

export function emitSessionAnswerGraded(
  sessionId: string,
  payload: { questionId: string; scoreFraction: number },
): void {
  io?.to(`session:${sessionId}`).emit("session:answer-graded", payload);
}

export function emitSessionGraded(sessionId: string, payload: { rawScore: number; percentile: number }): void {
  io?.to(`session:${sessionId}`).emit("session:graded", payload);
}

export function emitIntegrityFlag(
  assessmentId: string,
  payload: { sessionId: string; userId: string; event: string; count: number },
): void {
  io?.to(`assessment:${assessmentId}:live`).emit("integrity:flag", payload);
}
