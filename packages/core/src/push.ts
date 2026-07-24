import { z } from "zod";

export const pushPlatformSchema = z.enum(["ios", "android"]);
export type PushPlatform = z.infer<typeof pushPlatformSchema>;

export const registerPushTokenInput = z.object({
  token: z.string().trim().min(1),
  platform: pushPlatformSchema,
});
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenInput>;

export const unregisterPushTokenInput = z.object({
  token: z.string().trim().min(1),
});
export type UnregisterPushTokenInput = z.infer<typeof unregisterPushTokenInput>;
