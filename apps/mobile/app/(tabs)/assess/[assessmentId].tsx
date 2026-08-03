// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import type { AnswerResponse, Attempt, AttemptResult, RunnerQuestion } from "@trafy-community/core";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { withAuthRetry, trpc } from "@/lib/trpc-client";

export default function AssessmentRunnerScreen() {
  const { assessmentId } = useLocalSearchParams<{ assessmentId: string }>();

  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerResponse>>({});
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const submittedRef = useRef(false);

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const started = await withAuthRetry(() => trpc.assessments.startAttempt.mutate({ assessmentId }));
      setAttempt(started);
      submittedRef.current = false;
      setRemainingSeconds(started.timeLimitSeconds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start this assessment.");
    } finally {
      setStarting(false);
    }
  }

  function setAnswer(questionId: string, patch: Partial<AnswerResponse>) {
    setAnswers((current) => ({ ...current, [questionId]: { questionId, ...current[questionId], ...patch } }));
  }

  async function handleSubmit() {
    if (!attempt || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const graded = await withAuthRetry(() =>
        trpc.assessments.submitAttempt.mutate({ attemptId: attempt.id, answers: Object.values(answers) })
      );
      setResult(graded);
    } catch (err) {
      submittedRef.current = false;
      setError(err instanceof Error ? err.message : "Could not submit your answers.");
    } finally {
      setSubmitting(false);
    }
  }

  // Countdown + auto-submit when the time limit runs out.
  useEffect(() => {
    if (remainingSeconds === null || result) return;
    if (remainingSeconds <= 0) {
      handleSubmit();
      return;
    }
    const timer = setTimeout(() => setRemainingSeconds((s) => (s !== null ? s - 1 : s)), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds, result]);

  if (result) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: result.title }} />
        <Text style={styles.heading}>{result.passed ? "Passed 🎉" : "Not passed"}</Text>
        <Text style={styles.resultScore}>
          {result.percent}% ({result.rawScore}/{result.maxScore} points) — passing score {Math.round(result.passingScore * 100)}%
        </Text>
        {result.answers.map((a) => (
          <View key={a.questionId} style={styles.gradedRow}>
            <Text style={styles.gradedPrompt}>{a.prompt}</Text>
            <Text style={styles.gradedScore}>{Math.round(a.scoreFraction * 100)}% of {a.points} pts</Text>
          </View>
        ))}
      </ScrollView>
    );
  }

  if (!attempt) {
    return (
      <View style={styles.center}>
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={[styles.startButton, starting && styles.buttonDisabled]} disabled={starting} onPress={handleStart}>
          {starting ? <ActivityIndicator color="#fff" /> : <Text style={styles.startButtonText}>Start assessment</Text>}
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: attempt.title }} />
      {remainingSeconds !== null && (
        <Text style={styles.timer}>
          Time left: {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, "0")}
        </Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      {attempt.questions.map((q, i) => (
        <QuestionEditor key={q.id} index={i} question={q} answer={answers[q.id]} onChange={(patch) => setAnswer(q.id, patch)} />
      ))}

      <Pressable style={[styles.submitButton, submitting && styles.buttonDisabled]} disabled={submitting} onPress={handleSubmit}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Submit</Text>}
      </Pressable>
    </ScrollView>
  );
}

function QuestionEditor({
  index,
  question,
  answer,
  onChange,
}: {
  index: number;
  question: RunnerQuestion;
  answer: AnswerResponse | undefined;
  onChange: (patch: Partial<AnswerResponse>) => void;
}) {
  return (
    <View style={styles.questionBlock}>
      <Text style={styles.questionPrompt}>
        {index + 1}. {question.prompt} <Text style={styles.questionPoints}>({question.points} pt{question.points === 1 ? "" : "s"})</Text>
      </Text>

      {question.kind === "single_choice" &&
        question.options?.map((opt, i) => (
          <Pressable key={i} style={[styles.option, answer?.selectedIndex === i && styles.optionSelected]} onPress={() => onChange({ selectedIndex: i })}>
            <Text style={styles.optionText}>{opt}</Text>
          </Pressable>
        ))}

      {question.kind === "multi_choice" &&
        question.options?.map((opt, i) => {
          const selected = answer?.selectedIndices?.includes(i) ?? false;
          return (
            <Pressable
              key={i}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => {
                const current = answer?.selectedIndices ?? [];
                const next = selected ? current.filter((x) => x !== i) : [...current, i];
                onChange({ selectedIndices: next });
              }}
            >
              <Text style={styles.optionText}>
                {selected ? "☑" : "☐"} {opt}
              </Text>
            </Pressable>
          );
        })}

      {question.kind === "short_answer" && (
        <TextInput style={styles.textInput} placeholder="Your answer" value={answer?.text ?? ""} onChangeText={(text) => onChange({ text })} />
      )}

      {question.kind === "code" && (
        <>
          <Text style={styles.reducedUxHint}>
            Reduced mobile UX — no syntax highlighting or execution here; graded against the same keyword rubric as web
            (or hidden test cases if Judge0 is configured server-side).
          </Text>
          {question.starterCode ? <Text style={styles.starterCode}>{question.starterCode}</Text> : null}
          <TextInput
            style={[styles.textInput, styles.codeInput]}
            placeholder={`Write your ${question.language ?? "code"} here…`}
            value={answer?.source ?? question.starterCode ?? ""}
            onChangeText={(source) => onChange({ source })}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  error: { color: "#b00020", backgroundColor: "#fdecea", padding: 8, borderRadius: 8, fontSize: 12, marginBottom: 12, textAlign: "center" },
  heading: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
  timer: { fontSize: 13, color: "#666", marginBottom: 16, fontWeight: "600" },
  resultScore: { fontSize: 14, color: "#333", marginBottom: 20 },
  gradedRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  gradedPrompt: { fontSize: 13, marginBottom: 4 },
  gradedScore: { fontSize: 12, color: "#666" },
  startButton: { backgroundColor: "#111", borderRadius: 10, paddingVertical: 14, paddingHorizontal: 28 },
  startButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  buttonDisabled: { opacity: 0.6 },
  questionBlock: { marginBottom: 24 },
  questionPrompt: { fontSize: 14, fontWeight: "600", marginBottom: 10 },
  questionPoints: { fontWeight: "400", color: "#888" },
  option: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, marginBottom: 6 },
  optionSelected: { borderColor: "#111", backgroundColor: "#f7f7f7" },
  optionText: { fontSize: 13 },
  textInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, fontSize: 13 },
  codeInput: { fontFamily: "monospace", minHeight: 100, textAlignVertical: "top" },
  reducedUxHint: { fontSize: 11, color: "#888", marginBottom: 8, fontStyle: "italic" },
  starterCode: { fontFamily: "monospace", fontSize: 12, color: "#555", backgroundColor: "#f7f7f7", padding: 8, borderRadius: 6, marginBottom: 8 },
  submitButton: { backgroundColor: "#111", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  submitButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
