import { useCallback, useEffect, useRef, useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import type { AnswerResponsePayload, NextQuestionResult, SubmitSessionResult } from "@trafy-community/core";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { withAuthRetry, trpc } from "@/lib/trpc-client";

/** Answer keys are stripped server-side by toSafePayload before a question is served. */
type SafePayload = { options?: string[]; language?: string; starterCode?: string };
type LoadedQuestion = Extract<NextQuestionResult, { done: false }>;

export default function AssessmentRunnerScreen() {
  const { assessmentId } = useLocalSearchParams<{ assessmentId: string }>();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [current, setCurrent] = useState<LoadedQuestion | null>(null);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [response, setResponse] = useState<AnswerResponsePayload>({});
  const [result, setResult] = useState<SubmitSessionResult | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(false);

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const started = await withAuthRetry(() =>
        trpc.assessments.startSession.mutate({ assessmentId, webcamConsent: false })
      );
      submittedRef.current = false;
      setSessionId(started.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start this assessment.");
    } finally {
      setStarting(false);
    }
  }

  const loadQuestion = useCallback(async (sid: string, at: number) => {
    setLoading(true);
    setError(null);
    try {
      const next = await withAuthRetry(() => trpc.assessments.getNextQuestion.query({ sessionId: sid, index: at }));
      setTotal(next.total);
      if (next.done) {
        setCurrent(null);
      } else {
        setCurrent(next);
        const payload = next.question.payload as SafePayload;
        setResponse(next.question.kind === "code" ? { source: payload.starterCode ?? "" } : {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the next question.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionId) loadQuestion(sessionId, index);
  }, [sessionId, index, loadQuestion]);

  const handleSubmitSession = useCallback(async () => {
    if (!sessionId || submittedRef.current) return;
    submittedRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const graded = await withAuthRetry(() => trpc.assessments.submitSession.mutate({ sessionId }));
      setResult(graded);
    } catch (err) {
      submittedRef.current = false;
      setError(err instanceof Error ? err.message : "Could not submit your answers.");
    } finally {
      setBusy(false);
    }
  }, [sessionId]);

  // Countdown from the server-issued expiry; auto-submits at zero.
  useEffect(() => {
    if (!current || result) return;
    const deadline = new Date(current.expiresAt).getTime();
    const tick = () => {
      const secs = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemainingSeconds(secs);
      if (secs <= 0) handleSubmitSession();
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [current, result, handleSubmitSession]);

  async function saveAndAdvance() {
    if (!sessionId || !current) return;
    setBusy(true);
    setError(null);
    try {
      await withAuthRetry(() =>
        trpc.assessments.submitAnswer.mutate({ sessionId, questionId: current.question.id, response })
      );
      setIndex((i) => i + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your answer.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: "Result" }} />
        <Text style={styles.heading}>{Math.round(result.rawScore * 100)}%</Text>
        <Text style={styles.resultScore}>
          {Math.round(result.percentile)}th percentile against everyone else on this track
        </Text>
        {result.pending && (
          <Text style={styles.reducedUxHint}>
            Your code answers are still being executed — this score updates once grading finishes.
          </Text>
        )}
      </ScrollView>
    );
  }

  if (!sessionId) {
    return (
      <View style={styles.center}>
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          style={[styles.startButton, starting && styles.buttonDisabled]}
          disabled={starting}
          onPress={handleStart}
        >
          {starting ? <ActivityIndicator color="#fff" /> : <Text style={styles.startButtonText}>Start assessment</Text>}
        </Pressable>
      </View>
    );
  }

  if (loading && !current) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  // Past the last question — offer the final submit.
  if (!current) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: "Submit" }} />
        <Text style={styles.heading}>All questions answered</Text>
        <Text style={styles.resultScore}>Submit to have your session graded and scored against the cohort.</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          style={[styles.submitButton, busy && styles.buttonDisabled]}
          disabled={busy}
          onPress={handleSubmitSession}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Submit</Text>}
        </Pressable>
        <Pressable style={styles.backButton} disabled={busy} onPress={() => setIndex((i) => Math.max(0, i - 1))}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const q = current.question;
  const payload = q.payload as SafePayload;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: `Question ${current.index + 1} of ${total}` }} />
      {remainingSeconds !== null && (
        <Text style={styles.timer}>
          Time left: {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, "0")}
        </Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.questionBlock}>
        <Text style={styles.questionPrompt}>
          {current.index + 1}. {q.prompt}
        </Text>

        {q.kind === "single_choice" &&
          payload.options?.map((opt, i) => (
            <Pressable
              key={i}
              style={[styles.option, response.selectedIndex === i && styles.optionSelected]}
              onPress={() => setResponse({ selectedIndex: i })}
            >
              <Text style={styles.optionText}>{opt}</Text>
            </Pressable>
          ))}

        {q.kind === "multi_choice" &&
          payload.options?.map((opt, i) => {
            const selected = response.selectedIndices?.includes(i) ?? false;
            return (
              <Pressable
                key={i}
                style={[styles.option, selected && styles.optionSelected]}
                onPress={() => {
                  const cur = response.selectedIndices ?? [];
                  setResponse({ selectedIndices: selected ? cur.filter((x) => x !== i) : [...cur, i] });
                }}
              >
                <Text style={styles.optionText}>
                  {selected ? "☑" : "☐"} {opt}
                </Text>
              </Pressable>
            );
          })}

        {q.kind === "short_answer" && (
          <TextInput
            style={styles.textInput}
            placeholder="Your answer"
            value={response.text ?? ""}
            onChangeText={(text) => setResponse({ text })}
          />
        )}

        {q.kind === "code" && (
          <>
            <Text style={styles.reducedUxHint}>
              Reduced mobile UX — no syntax highlighting or execution here; graded against the same keyword rubric as
              web (or hidden test cases if Judge0 is configured server-side).
            </Text>
            <TextInput
              style={[styles.textInput, styles.codeInput]}
              placeholder={`Write your ${payload.language ?? "code"} here…`}
              value={response.source ?? ""}
              onChangeText={(source) => setResponse({ source })}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
            />
          </>
        )}
      </View>

      <Pressable style={[styles.submitButton, busy && styles.buttonDisabled]} disabled={busy} onPress={saveAndAdvance}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>
            {current.index + 1 === total ? "Save & finish" : "Save & continue"}
          </Text>
        )}
      </Pressable>
      {index > 0 && (
        <Pressable style={styles.backButton} disabled={busy} onPress={() => setIndex((i) => Math.max(0, i - 1))}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  error: {
    color: "#b00020",
    backgroundColor: "#fdecea",
    padding: 8,
    borderRadius: 8,
    fontSize: 12,
    marginBottom: 12,
    textAlign: "center",
  },
  heading: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
  timer: { fontSize: 13, color: "#666", marginBottom: 16, fontWeight: "600" },
  resultScore: { fontSize: 14, color: "#333", marginBottom: 20 },
  startButton: { backgroundColor: "#111", borderRadius: 10, paddingVertical: 14, paddingHorizontal: 28 },
  startButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  buttonDisabled: { opacity: 0.6 },
  questionBlock: { marginBottom: 24 },
  questionPrompt: { fontSize: 14, fontWeight: "600", marginBottom: 10 },
  option: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, marginBottom: 6 },
  optionSelected: { borderColor: "#111", backgroundColor: "#f7f7f7" },
  optionText: { fontSize: 13 },
  textInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, fontSize: 13 },
  codeInput: { fontFamily: "monospace", minHeight: 100, textAlignVertical: "top" },
  reducedUxHint: { fontSize: 11, color: "#888", marginBottom: 8, fontStyle: "italic" },
  submitButton: { backgroundColor: "#111", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  submitButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  backButton: { paddingVertical: 12, alignItems: "center", marginTop: 4 },
  backButtonText: { color: "#666", fontSize: 14, fontWeight: "600" },
});
