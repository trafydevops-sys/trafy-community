import { useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from "react-native";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { useAuth } from "@/lib/auth-context";

/**
 * A deliberately minimal subset of the web app's multi-step Profile Creation
 * wizard (name/title/bio only — no education/experience/certificate upload
 * yet). This is Milestone 7's "shell" scope; the full wizard can come later
 * if mobile profile parity is needed.
 */
export default function OnboardingScreen() {
  const { user } = useAuth();

  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleFinish() {
    setSaving(true);
    setError(null);
    try {
      await withAuthRetry(() =>
        trpc.profile.update.mutate({
          fullName: fullName.trim(),
          title: title.trim() || undefined,
          bio: bio.trim() || undefined,
        })
      );
      router.replace("/(tabs)/feed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Set up your profile</Text>
        <Text style={styles.subheading}>
          {user?.email ? `Signed in as ${user.email}.` : ""} You can fill in the rest from the web app later.
        </Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.label}>Full name</Text>
        <TextInput style={styles.input} autoFocus value={fullName} onChangeText={setFullName} />

        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Frontend Developer"
        />

        <Text style={styles.label}>Bio</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={4}
        />

        <Pressable
          style={[styles.button, (saving || !fullName.trim()) && styles.buttonDisabled]}
          disabled={saving || !fullName.trim()}
          onPress={handleFinish}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Finish</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24 },
  heading: { fontSize: 24, fontWeight: "700", marginBottom: 4 },
  subheading: { fontSize: 13, color: "#666", marginBottom: 20 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  multiline: { textAlignVertical: "top", minHeight: 90 },
  button: {
    backgroundColor: "#111",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  error: {
    color: "#b00020",
    backgroundColor: "#fdecea",
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    fontSize: 13,
  },
});
