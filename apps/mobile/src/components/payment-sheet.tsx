import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { formatMoney } from "@/lib/format";

type PaymentSheetProps = {
  visible: boolean;
  courseTitle: string;
  priceCents: number;
  currency: string;
  onCancel: () => void;
  onConfirm: () => Promise<{ stub: boolean }>;
  onDone: () => void;
};

/**
 * A native-feeling bottom-sheet payment confirmation, styled like an Apple
 * Pay / Google Pay sheet. Under the hood it calls the exact same
 * env-gated `payments.checkout` stub as web — this milestone is about the
 * native checkout *UX*, not wiring real App Store/Play Store in-app
 * purchases (that's Milestone 10's "IAP/store compliance" scope).
 */
export function PaymentSheet({ visible, courseTitle, priceCents, currency, onCancel, onConfirm, onDone }: PaymentSheetProps) {
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [stub, setStub] = useState(false);
  const isFree = priceCents === 0;

  async function handlePay() {
    setState("processing");
    setError(null);
    try {
      const result = await onConfirm();
      setStub(result.stub);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed.");
      setState("error");
    }
  }

  function handleClose() {
    const wasDone = state === "done";
    setState("idle");
    setError(null);
    if (wasDone) onDone();
    else onCancel();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {state === "done" ? (
            <>
              <Text style={styles.title}>{stub ? "Payment completed (test mode)" : "Payment successful"}</Text>
              <Text style={styles.subtitle}>You're enrolled in {courseTitle}.</Text>
              <Pressable style={styles.button} onPress={handleClose}>
                <Text style={styles.buttonText}>Done</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>{courseTitle}</Text>
              <Text style={styles.price}>{formatMoney(priceCents, currency)}</Text>
              {error && <Text style={styles.error}>{error}</Text>}
              <Pressable
                style={[styles.button, state === "processing" && styles.buttonDisabled]}
                disabled={state === "processing"}
                onPress={handlePay}
              >
                {state === "processing" ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>{isFree ? "Confirm enrollment" : `Pay ${formatMoney(priceCents, currency)}`}</Text>
                )}
              </Pressable>
              <Pressable style={styles.cancelButton} onPress={handleClose} disabled={state === "processing"}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, alignItems: "center" },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#ddd", marginBottom: 16 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 4, textAlign: "center" },
  subtitle: { fontSize: 13, color: "#666", marginBottom: 20, textAlign: "center" },
  price: { fontSize: 32, fontWeight: "700", marginBottom: 24 },
  error: { color: "#b00020", fontSize: 13, marginBottom: 12, textAlign: "center" },
  button: { backgroundColor: "#111", borderRadius: 12, paddingVertical: 16, alignItems: "center", width: "100%", marginBottom: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  cancelButton: { paddingVertical: 8 },
  cancelText: { color: "#888", fontSize: 14 },
});
