import * as Notifications from "expo-notifications";
import { router } from "expo-router";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Deep-links a tapped push notification to the right screen: a chat message
 * opens straight into that thread (using the channelId we put in `data` when
 * sending — see apps/api/src/lib/push-send.ts), anything else opens the
 * Notifications tab. Call once from the root layout.
 */
export function registerNotificationResponseHandler(): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    if (data?.type === "chat_message" && typeof data.channelId === "string") {
      router.push(`/(tabs)/chats/${data.channelId}`);
    } else {
      router.push("/(tabs)/notifications");
    }
  });
  return () => subscription.remove();
}
