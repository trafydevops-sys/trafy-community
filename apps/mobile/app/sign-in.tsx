import { useState } from "react";
import { router } from "expo-router";
import { TRPCClientError } from "@trpc/client";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from "react-native";
import { trpc } from "@/lib/trpc-client";
import { useAuth } from "@/lib/auth-context";

type Step = "email" | "code";

export default function SignInScreen() {
  const { login } = useAuth();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleRequestOtp() {
    setError(null);
    setBusy(true);
    try {
      const result = await trpc.auth.requestOtp.mutate({ email: email.trim() });
      setDevCode(result.devCode ?? null);
      setStep("code");
    } catch (err) {
      setError(err instanceof TRPCClientError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp() {
    setError(null);
    setBusy(true);
    try {
      const tokens = await trpc.auth.verifyOtp.mutate({ email: email.trim(), code });
      await login(tokens);
      router.replace("/");
    } catch (err) {
      setError(err instanceof TRPCClientError ? err.message : "Incorrect or expired code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.heading}>Trafy Community</Text>
      <Text style={styles.subheading}>No passwords — we&apos;ll email you a 6-digit code.</Text>

      {error && <Text style={styles.error}>{error}</Text>}
      {devCode && (
        <Text style={styles.devCode}>No email provider configured — your dev code is {devCode}</Text>
      )}

      {step === "email" ? (
        <>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
          />
          <Pressable
            style={[styles.button, (busy || !email.trim()) && styles.buttonDisabled]}
            disabled={busy || !email.trim()}
            onPress={handleRequestOtp}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send sign-in code</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.label}>6-digit code</Text>
          <TextInput
            style={styles.input}
            autoFocus
            keyboardType="number-pad"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, ""))}
          />
          <Text style={styles.hint}>Sent to {email}.</Text>
          <Pressable
            style={[styles.button, (busy || code.length !== 6) && styles.buttonDisabled]}
            disabled={busy || code.length !== 6}
            onPress={handleVerifyOtp}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify &amp; continue</Text>}
          </Pressable>
          <Pressable
            style={styles.linkButton}
            onPress={() => {
              setStep("email");
              setCode("");
              setDevCode(null);
            }}
          >
            <Text style={styles.linkText}>Use a different email</Text>
          </Pressable>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  heading: { fontSize: 28, fontWeight: "700", marginBottom: 4 },
  subheading: { fontSize: 14, color: "#666", marginBottom: 24 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
  hint: { fontSize: 12, color: "#666", marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    backgroundColor: "#111",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  linkButton: { marginTop: 16, alignItems: "center" },
  linkText: { color: "#555", fontSize: 13 },
  error: {
    color: "#b00020",
    backgroundColor: "#fdecea",
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    fontSize: 13,
  },
  devCode: {
    color: "#7a5a00",
    backgroundColor: "#fff6db",
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    fontSize: 13,
  },
});
