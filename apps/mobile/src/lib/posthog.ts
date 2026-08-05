import PostHog from "posthog-react-native";

// Expo inlines EXPO_PUBLIC_* vars from .env at build time — no app.config.js
// + expo-constants indirection needed. Same env-gated, graceful-fallback
// pattern as the rest of this codebase (RESEND_API_KEY / JUDGE0_URL): with no
// token, `disabled: true` below makes every posthog.* call a no-op.
const projectToken = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const isConfigured = Boolean(projectToken);

if (__DEV__ && !isConfigured) {
  console.warn("[posthog] EXPO_PUBLIC_POSTHOG_KEY not set — analytics disabled (dev stub).");
}

export const posthog = new PostHog(projectToken || "placeholder_key", {
  host,
  disabled: !isConfigured,
  captureAppLifecycleEvents: true,
  flushAt: 20,
  flushInterval: 10000,
});

if (__DEV__) posthog.debug(true);
