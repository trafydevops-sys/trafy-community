// @ts-nocheck
import { useEffect, useState } from "react";
import { router } from "expo-router";
import type { AssessmentSummary, AttemptHistoryItem } from "@trafy-community/core";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { withAuthRetry, trpc } from "@/lib/trpc-client";

export default function AssessCatalogScreen() {
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [attempts, setAttempts] = useState<AttemptHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [published, mine] = await Promise.all([
        withAuthRetry(() => trpc.assessments.listPublished.query({})),
        withAuthRetry(() => trpc.assessments.myAttempts.query()),
      ]);
      setAssessments(published);
      setAttempts(mine);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load assessments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={assessments}
        keyExtractor={(a) => a.id}
        ListHeaderComponent={
          attempts.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your attempts</Text>
              {attempts.slice(0, 5).map((a) => (
                <View key={a.attemptId} style={styles.attemptRow}>
                  <Text style={styles.attemptTitle}>{a.title}</Text>
                  <Text style={[styles.attemptScore, a.passed ? styles.passed : styles.failed]}>
                    {a.percent}% · {a.passed ? "Passed" : "Not passed"}
                  </Text>
                </View>
              ))}
              <Text style={styles.sectionTitle}>Assessments</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={<Text style={styles.empty}>No published assessments yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/(tabs)/assess/${item.id}`)}>
            <Text style={styles.rowTitle}>{item.title}</Text>
            <Text style={styles.rowMeta}>
              {item.questionCount} question{item.questionCount === 1 ? "" : "s"} · by {item.authorName}
              {item.timeLimitSeconds ? ` · ${Math.round(item.timeLimitSeconds / 60)} min` : ""}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: "#b00020", backgroundColor: "#fdecea", padding: 8, fontSize: 12, textAlign: "center" },
  section: { paddingHorizontal: 12 },
  sectionTitle: { fontWeight: "700", fontSize: 14, marginTop: 12, marginBottom: 8 },
  attemptRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f5f5f5" },
  attemptTitle: { fontSize: 13, flex: 1 },
  attemptScore: { fontSize: 13, fontWeight: "600" },
  passed: { color: "#1a7a3c" },
  failed: { color: "#b00020" },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  row: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  rowTitle: { fontWeight: "600", fontSize: 15, marginBottom: 2 },
  rowMeta: { fontSize: 12, color: "#666" },
});
