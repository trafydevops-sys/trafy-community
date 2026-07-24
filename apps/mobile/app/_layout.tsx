import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/lib/auth-context";
import { registerNotificationResponseHandler } from "@/lib/notification-handler";

export default function RootLayout() {
  useEffect(() => registerNotificationResponseHandler(), []);

  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
