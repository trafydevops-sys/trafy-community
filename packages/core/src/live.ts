import { z } from "zod";

export const getLiveJoinTokenInput = z.object({ lessonId: z.string().uuid() });
export type GetLiveJoinTokenInput = z.infer<typeof getLiveJoinTokenInput>;

// The LiveKit websocket URL + a room-scoped JWT are enough for any LiveKit
// client (web's livekit-client, or a native SDK later) to connect directly —
// no further backend round trip needed once issued.
export const liveJoinInfoSchema = z.object({
  livekitUrl: z.string(),
  token: z.string(),
  roomName: z.string(),
  lessonTitle: z.string(),
});
export type LiveJoinInfo = z.infer<typeof liveJoinInfoSchema>;
