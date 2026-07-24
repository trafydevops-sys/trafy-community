"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import { withAuthRetry, trpc } from "@/lib/trpc-client";

type Status = "loading" | "connecting" | "connected" | "error";

/**
 * Works two ways: opened from the web app itself (no query params — uses the
 * browser's own authenticated session to mint a token via live.getJoinToken),
 * or opened from mobile via an in-app browser, which mints the token
 * server-side and passes `token`/`livekitUrl` as query params instead (mobile
 * has no way to share its SecureStore session with an external browser view).
 */
export default function LiveRoomPage() {
  const params = useParams<{ lessonId: string }>();
  const searchParams = useSearchParams();
  const lessonId = params.lessonId;

  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("Live class");
  const containerRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let livekitUrl: string;
      let token: string;

      try {
        const queryToken = searchParams.get("token");
        const queryUrl = searchParams.get("livekitUrl");
        if (queryToken && queryUrl) {
          livekitUrl = queryUrl;
          token = queryToken;
        } else {
          const info = await withAuthRetry(() => trpc.live.getJoinToken.mutate({ lessonId }));
          livekitUrl = info.livekitUrl;
          token = info.token;
          setTitle(info.lessonTitle);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not join the live session.");
          setStatus("error");
        }
        return;
      }

      if (cancelled) return;
      setStatus("connecting");

      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Video && track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        if (track.kind === Track.Kind.Video) {
          el.style.width = "320px";
          el.style.borderRadius = "12px";
        }
        containerRef.current?.appendChild(el);
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el) => el.remove());
      });

      try {
        await room.connect(livekitUrl, token);
        await room.localParticipant.enableCameraAndMicrophone();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not connect to the live session.");
          setStatus("error");
        }
        return;
      }

      if (cancelled) {
        room.disconnect();
        return;
      }
      setStatus("connected");
    })();

    return () => {
      cancelled = true;
      roomRef.current?.disconnect();
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  return (
    <main className="shell wide">
      <div className="brand">{title}</div>
      {(status === "loading" || status === "connecting") && <p className="hint">Connecting…</p>}
      {status === "error" && <div className="error-banner">{error}</div>}
      <div ref={containerRef} style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }} />
    </main>
  );
}
