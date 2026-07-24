import { useEffect, useState } from "react";
import { router } from "expo-router";
import type { CourseSummary, MyEnrollment } from "@trafy-community/core";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { formatMoney } from "@/lib/format";

export default function LearnCatalogScreen() {
  const [query, setQuery] = useState("");
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [enrollments, setEnrollments] = useState<MyEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(q?: string) {
    setError(null);
    try {
      const [found, mine] = await Promise.all([
        withAuthRetry(() => trpc.courses.listPublished.query({ query: q || undefined })),
        withAuthRetry(() => trpc.courses.myEnrollments.query()),
      ]);
      setCourses(found);
      setEnrollments(mine);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load courses.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const enrolledIds = new Set(enrollments.map((e) => e.course.id));

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

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search courses…"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => load(query)}
        />
        <Pressable style={styles.searchButton} onPress={() => load(query)}>
          <Text style={styles.searchButtonText}>Search</Text>
        </Pressable>
      </View>

      <FlatList
        data={courses}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={
          enrollments.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Continue learning</Text>
              {enrollments.map((e) => (
                <Pressable key={e.course.id} style={styles.enrollmentRow} onPress={() => router.push(`/(tabs)/learn/${e.course.id}`)}>
                  <Text style={styles.rowTitle}>{e.course.title}</Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${e.progressPercent}%` }]} />
                  </View>
                  <Text style={styles.rowMeta}>{e.progressPercent}% complete</Text>
                </Pressable>
              ))}
              <Text style={styles.sectionTitle}>All courses</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={<Text style={styles.empty}>No published courses yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/(tabs)/learn/${item.id}`)}>
            <Text style={styles.rowTitle}>{item.title}</Text>
            <Text style={styles.rowMeta}>
              {formatMoney(item.priceCents, item.currency)} · by {item.creatorName}
              {item.organizationName ? ` · ${item.organizationName}` : ""}
              {enrolledIds.has(item.id) ? " · enrolled" : ""}
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
  searchRow: { flexDirection: "row", gap: 8, padding: 12 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  searchButton: { backgroundColor: "#eee", borderRadius: 10, paddingHorizontal: 14, justifyContent: "center" },
  searchButtonText: { color: "#111", fontWeight: "600", fontSize: 13 },
  section: { paddingHorizontal: 12 },
  sectionTitle: { fontWeight: "700", fontSize: 14, marginTop: 8, marginBottom: 8 },
  enrollmentRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  progressTrack: { height: 4, backgroundColor: "#eee", borderRadius: 2, marginTop: 6, marginBottom: 4 },
  progressFill: { height: 4, backgroundColor: "#111", borderRadius: 2 },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  row: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  rowTitle: { fontWeight: "600", fontSize: 15, marginBottom: 2 },
  rowMeta: { fontSize: 12, color: "#666" },
});
