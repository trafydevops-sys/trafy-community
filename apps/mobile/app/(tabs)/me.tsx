import { useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { registerForPushNotifications } from "@/lib/push";

type PushStatus = { state: "idle" } | { state: "busy" } | { state: "done"; message: string; ok: boolean };

export default function MeScreen() {
  const { user, logout } = useAuth();
  const [push, setPush] = useState<PushStatus>({ state: "idle" });

  async function handleEnablePush() {
    setPush({ state: "busy" });
    const result = await registerForPushNotifications();
    setPush(
      result.ok
        ? { state: "done", ok: true, message: "Push notifications enabled on this device." }
        : { state: "done", ok: false, message: result.message }
    );
  }

  async function handleSignOut() {
    await logout();
    router.replace("/");
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>Trafy Community</Text>
      <Text style={styles.subheading}>Signed in as {user?.email}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Push notifications</Text>
        {push.state === "done" && (
          <Text style={[styles.pushMessage, push.ok ? styles.pushOk : styles.pushError]}>{push.message}</Text>
        )}
        <Pressable
          style={[styles.secondaryButton, push.state === "busy" && styles.buttonDisabled]}
          disabled={push.state === "busy"}
          onPress={handleEnablePush}
        >
          {push.state === "busy" ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.secondaryButtonText}>Enable push notifications</Text>
          )}
        </Pressable>
      </View>

      <Pressable style={styles.button} onPress={handleSignOut}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, paddingTop: 32, backgroundColor: "#fff" },
  heading: { fontSize: 26, fontWeight: "700" },
  subheading: { fontSize: 14, color: "#666", marginTop: 4, marginBottom: 24 },
  card: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: "600", marginBottom: 6 },
  pushMessage: { fontSize: 13, marginBottom: 10 },
  pushOk: { color: "#1a7a3c" },
  pushError: { color: "#b00020" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#111",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: { color: "#111", fontWeight: "600", fontSize: 14 },
  button: {
    backgroundColor: "#111",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
