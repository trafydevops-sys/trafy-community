import { useEffect } from "react";
import { Stack } from "expo-router";
import { isRunningInExpoGo } from "expo";
import { StatusBar } from "expo-status-bar";
import * as Sentry from "@sentry/react-native";
import { PostHogProvider } from "posthog-react-native";
import { AuthProvider } from "@/lib/auth-context";
import { registerNotificationResponseHandler } from "@/lib/notification-handler";
import { posthog } from "@/lib/posthog";

// Same env-gated, graceful-fallback pattern as everywhere else in this app
// (RESEND_API_KEY / JUDGE0_URL): with no EXPO_PUBLIC_SENTRY_DSN, Sentry.init
// below simply no-ops — every Sentry.* call becomes a harmless stub, so local
// dev needs zero Sentry account.
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (__DEV__ && !sentryDsn) {
  console.warn("[sentry] EXPO_PUBLIC_SENTRY_DSN not set — error tracking disabled (dev stub).");
}

Sentry.init({
  dsn: sentryDsn,
  tracesSampleRate: __DEV__ ? 1.0 : 0.1,
  enableNativeFramesTracking: !isRunningInExpoGo(),
  environment: __DEV__ ? "development" : "production",
});

function RootLayout() {
  useEffect(() => registerNotificationResponseHandler(), []);

  return (
    <PostHogProvider
      client={posthog}
      autocapture={{ captureScreens: false, captureTouches: true, maxElementsCaptured: 20 }}
    >
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </PostHogProvider>
  );
}

// Expo Router handles navigation tracking automatically for Sentry; no
// NavigationContainer wrapper is needed for this setup.
export default Sentry.wrap(RootLayout);
