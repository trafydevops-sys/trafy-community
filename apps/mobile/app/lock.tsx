import { useEffect, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { authenticateWithBiometrics } from "@/lib/biometrics";

export default function LockScreen() {
  const { markUnlocked, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function attemptUnlock() {
    setBusy(true);
    setError(null);
    try {
      const success = await authenticateWithBiometrics();
      if (success) {
        markUnlocked();
        router.replace("/");
      } else {
        setError("Not verified. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  // Prompt automatically on arrival so most people never have to tap anything.
  useEffect(() => {
    attemptUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>Trafy Community is locked</Text>
      <Text style={styles.subheading}>Verify it&apos;s you to continue.</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={[styles.button, busy && styles.buttonDisabled]} disabled={busy} onPress={attemptUnlock}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Unlock</Text>}
      </Pressable>

      <Pressable
        style={styles.linkButton}
        onPress={async () => {
          await logout();
          router.replace("/");
        }}
      >
        <Text style={styles.linkText}>Sign out instead</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  heading: { fontSize: 22, fontWeight: "700", marginBottom: 6, textAlign: "center" },
  subheading: { fontSize: 14, color: "#666", marginBottom: 24, textAlign: "center" },
  button: {
    backgroundColor: "#111",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  linkButton: { marginTop: 20 },
  linkText: { color: "#555", fontSize: 13 },
  error: {
    color: "#b00020",
    backgroundColor: "#fdecea",
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    fontSize: 13,
  },
});
