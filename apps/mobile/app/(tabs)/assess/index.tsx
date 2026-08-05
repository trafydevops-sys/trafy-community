import { useEffect, useState } from "react";
import { router } from "expo-router";
import type { AssessmentSummary, TrackResultHistoryItem } from "@trafy-community/core";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { withAuthRetry, trpc } from "@/lib/trpc-client";

export default function AssessCatalogScreen() {
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [history, setHistory] = useState<TrackResultHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [published, results] = await Promise.all([
        withAuthRetry(() => trpc.assessments.list.query({})),
        withAuthRetry(() => trpc.assessments.myHistory.query()),
      ]);
      setAssessments(published);
      setHistory(results);
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
          history.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your results</Text>
              {history.slice(0, 5).map((h) => (
                <View key={h.sessionId} style={styles.attemptRow}>
                  <Text style={styles.attemptTitle}>{h.assessmentTitle || h.track}</Text>
                  <Text style={styles.attemptScore}>
                    {Math.round(h.rawScore * 100)}% · {Math.round(h.percentile)}th pct
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
              {item.track} · {item.questionCount} question{item.questionCount === 1 ? "" : "s"} · by{" "}
              {item.authorName}
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
  attemptRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  attemptTitle: { fontSize: 13, flex: 1 },
  attemptScore: { fontSize: 13, fontWeight: "600", color: "#1a7a3c" },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  row: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  rowTitle: { fontWeight: "600", fontSize: 15, marginBottom: 2 },
  rowMeta: { fontSize: 12, color: "#666" },
});
