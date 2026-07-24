import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { trpc, withAuthRetry } from "./trpc-client";

export type PushRegistrationResult = { ok: true; token: string } | { ok: false; message: string };

/**
 * Requests notification permission, fetches an Expo push token, and
 * registers it with the backend (push.registerToken). Sending pushes on
 * notify() isn't wired up yet — that's Milestone 8 ("push notifications
 * end-to-end"). This milestone only covers registration.
 */
export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  if (!Device.isDevice) {
    return { ok: false, message: "Push notifications require a physical device, not a simulator." };
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") {
    return { ok: false, message: "Notification permission was not granted." };
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;

  let token: string;
  try {
    const response = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    token = response.data;
  } catch (err) {
    // Requesting a real Expo push token needs an EAS project ID, which this
    // scaffold doesn't configure (that's an `eas init` step, not code) — fail
    // clearly instead of crashing.
    return {
      ok: false,
      message: err instanceof Error ? `Could not get a push token: ${err.message}` : "Could not get a push token.",
    };
  }

  try {
    await withAuthRetry(() =>
      trpc.push.registerToken.mutate({ token, platform: Platform.OS === "ios" ? "ios" : "android" })
    );
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not register the push token." };
  }

  return { ok: true, token };
}
