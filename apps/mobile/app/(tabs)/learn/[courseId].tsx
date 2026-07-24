import { useEffect, useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import type { CourseDetail } from "@trafy-community/core";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { withAuthRetry, trpc, WEB_URL } from "@/lib/trpc-client";
import { formatMoney } from "@/lib/format";
import { PaymentSheet } from "@/components/payment-sheet";

export default function CourseDetailScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cohortId, setCohortId] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [joiningLessonId, setJoiningLessonId] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [savingReview, setSavingReview] = useState(false);

  async function load() {
    setError(null);
    try {
      const detail = await withAuthRetry(() => trpc.courses.getById.query({ courseId }));
      setCourse(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this course.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  useEffect(() => {
    if (course?.myReview) {
      setReviewRating(course.myReview.rating);
      setReviewComment(course.myReview.comment ?? "");
    }
  }, [course?.myReview]);

  async function handleSubmitReview() {
    setSavingReview(true);
    setError(null);
    try {
      await withAuthRetry(() => trpc.courses.submitReview.mutate({ courseId, rating: reviewRating, comment: reviewComment || undefined }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your review.");
    } finally {
      setSavingReview(false);
    }
  }

  async function handleDeleteReview() {
    setSavingReview(true);
    setError(null);
    try {
      await withAuthRetry(() => trpc.courses.deleteReview.mutate({ courseId }));
      setReviewRating(5);
      setReviewComment("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete your review.");
    } finally {
      setSavingReview(false);
    }
  }

  async function toggleLesson(lessonId: string, completed: boolean) {
    if (!course) return;
    setCourse({
      ...course,
      modules: course.modules.map((m) => ({
        ...m,
        lessons: m.lessons.map((l) => (l.id === lessonId ? { ...l, completed } : l)),
      })),
    });
    try {
      await withAuthRetry(() => trpc.courses.setProgress.mutate({ lessonId, completed }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update progress.");
    }
  }

  async function handleJoinLive(lessonId: string) {
    setJoiningLessonId(lessonId);
    setError(null);
    try {
      const info = await withAuthRetry(() => trpc.live.getJoinToken.mutate({ lessonId }));
      const url = `${WEB_URL}/live/${lessonId}?token=${encodeURIComponent(info.token)}&livekitUrl=${encodeURIComponent(info.livekitUrl)}`;
      await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the live session.");
    } finally {
      setJoiningLessonId(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!course) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "Course not found."}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: course.title }} />
      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.heading}>{course.title}</Text>
      <Text style={styles.subheading}>
        by {course.creatorName}
        {course.organizationName ? ` · ${course.organizationName}` : ""} · {course.enrollmentCount} enrolled
      </Text>
      {course.description ? <Text style={styles.description}>{course.description}</Text> : null}

      {!course.enrolled ? (
        <View style={styles.card}>
          <Text style={styles.cardText}>
            {course.pricingType === "free" ? "This course is free." : `Enroll for ${formatMoney(course.priceCents, course.currency)}.`}
          </Text>

          {course.cohorts.length > 0 && (
            <View style={styles.cohortPicker}>
              <Text style={styles.cohortLabel}>Cohort</Text>
              <Pressable style={[styles.cohortOption, cohortId === null && styles.cohortOptionSelected]} onPress={() => setCohortId(null)}>
                <Text style={styles.cohortOptionText}>Self-paced (no fixed schedule)</Text>
              </Pressable>
              {course.cohorts.map((c) => (
                <Pressable
                  key={c.id}
                  style={[styles.cohortOption, cohortId === c.id && styles.cohortOptionSelected]}
                  disabled={c.seatsLeft === 0}
                  onPress={() => setCohortId(c.id)}
                >
                  <Text style={[styles.cohortOptionText, c.seatsLeft === 0 && styles.cohortOptionDisabledText]}>
                    {c.name} · {new Date(c.startDate).toLocaleDateString()}–{new Date(c.endDate).toLocaleDateString()}
                    {c.capacity != null ? ` (${c.seatsLeft} left)` : ""}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <Pressable style={styles.enrollButton} onPress={() => setSheetVisible(true)}>
            <Text style={styles.enrollButtonText}>
              {course.pricingType === "free" ? "Enroll for free" : `Buy — ${formatMoney(course.priceCents, course.currency)}`}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${course.progressPercent}%` }]} />
        </View>
      )}

      {course.modules.length === 0 ? (
        <Text style={styles.empty}>No lessons published yet.</Text>
      ) : (
        course.modules.map((mod) => (
          <View key={mod.id} style={styles.moduleBlock}>
            <Text style={styles.moduleTitle}>{mod.title}</Text>
            {mod.lessons.map((lesson) => (
              <View key={lesson.id} style={styles.lessonRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lessonTitle}>
                    {lesson.title} {lesson.locked ? "🔒" : ""}
                    {lesson.isSample && !course.enrolled ? " · Sample" : ""}
                  </Text>
                  {lesson.contentType === "live" && lesson.scheduledAt && (
                    <Text style={styles.lessonHint}>Live session: {new Date(lesson.scheduledAt).toLocaleString()}</Text>
                  )}
                  {!lesson.locked && lesson.contentType === "text" && lesson.textContent && (
                    <Text style={styles.lessonBody}>{lesson.textContent}</Text>
                  )}
                  {!lesson.locked && lesson.contentType === "video" && (
                    <Text style={styles.lessonHint}>Video lesson — watch it from the web app for now.</Text>
                  )}
                  {lesson.locked && <Text style={styles.lessonHint}>Enroll to unlock this lesson.</Text>}
                  {lesson.contentType === "live" && !lesson.locked && (
                    <Pressable
                      style={styles.joinLiveButton}
                      disabled={joiningLessonId === lesson.id}
                      onPress={() => handleJoinLive(lesson.id)}
                    >
                      {joiningLessonId === lesson.id ? (
                        <ActivityIndicator size="small" />
                      ) : (
                        <Text style={styles.joinLiveButtonText}>Join live class</Text>
                      )}
                    </Pressable>
                  )}
                </View>
                {course.enrolled && (
                  <Pressable onPress={() => toggleLesson(lesson.id, !lesson.completed)}>
                    <Text style={styles.checkbox}>{lesson.completed ? "☑" : "☐"}</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        ))
      )}

      <View style={styles.moduleBlock}>
        <Text style={styles.moduleTitle}>
          Reviews {course.reviewCount > 0 ? `· ${course.avgRating?.toFixed(1)} ★ (${course.reviewCount})` : ""}
        </Text>

        {course.completed ? (
          <View style={styles.card}>
            <Text style={styles.cohortLabel}>Your rating</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setReviewRating(n)}>
                  <Text style={styles.ratingStar}>{n <= reviewRating ? "★" : "☆"}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.reviewInput}
              placeholder="Comment (optional)"
              value={reviewComment}
              onChangeText={setReviewComment}
              multiline
              maxLength={2000}
            />
            <Pressable style={styles.enrollButton} disabled={savingReview} onPress={handleSubmitReview}>
              {savingReview ? <ActivityIndicator color="#fff" /> : <Text style={styles.enrollButtonText}>{course.myReview ? "Update review" : "Submit review"}</Text>}
            </Pressable>
            {course.myReview && (
              <Pressable style={styles.deleteReviewButton} disabled={savingReview} onPress={handleDeleteReview}>
                <Text style={styles.deleteReviewButtonText}>Delete review</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <Text style={styles.lessonHint}>Finish the course to leave a review.</Text>
        )}

        {course.reviews.length === 0 ? (
          <Text style={styles.empty}>No reviews yet.</Text>
        ) : (
          course.reviews.map((r) => (
            <View key={r.id} style={styles.reviewRow}>
              <Text style={styles.lessonTitle}>
                {"★".repeat(r.rating)}
                {"☆".repeat(5 - r.rating)} · {r.authorName || "Anonymous"}
              </Text>
              {r.comment ? <Text style={styles.lessonBody}>{r.comment}</Text> : null}
            </View>
          ))
        )}
      </View>

      <PaymentSheet
        visible={sheetVisible}
        courseTitle={course.title}
        priceCents={course.priceCents}
        currency={course.currency}
        onCancel={() => setSheetVisible(false)}
        onConfirm={() => withAuthRetry(() => trpc.payments.checkout.mutate({ courseId, cohortId: cohortId ?? undefined }))}
        onDone={() => {
          setSheetVisible(false);
          load();
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: "#b00020", backgroundColor: "#fdecea", padding: 8, borderRadius: 8, fontSize: 12, marginBottom: 12 },
  heading: { fontSize: 22, fontWeight: "700" },
  subheading: { fontSize: 13, color: "#666", marginTop: 4, marginBottom: 12 },
  description: { fontSize: 14, color: "#333", marginBottom: 16, lineHeight: 20 },
  card: { borderWidth: 1, borderColor: "#eee", borderRadius: 12, padding: 16, marginBottom: 20 },
  cardText: { fontSize: 14, marginBottom: 12 },
  cohortPicker: { marginBottom: 12 },
  cohortLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6, color: "#666" },
  cohortOption: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, marginBottom: 6 },
  cohortOptionSelected: { borderColor: "#111", backgroundColor: "#f7f7f7" },
  cohortOptionText: { fontSize: 13 },
  cohortOptionDisabledText: { color: "#bbb" },
  enrollButton: { backgroundColor: "#111", borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  enrollButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  progressTrack: { height: 6, backgroundColor: "#eee", borderRadius: 3, marginBottom: 20 },
  progressFill: { height: 6, backgroundColor: "#111", borderRadius: 3 },
  empty: { textAlign: "center", color: "#888", marginTop: 20 },
  moduleBlock: { marginBottom: 20 },
  moduleTitle: { fontWeight: "700", fontSize: 15, marginBottom: 8 },
  lessonRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f5f5f5", gap: 10 },
  lessonTitle: { fontSize: 14, fontWeight: "600" },
  lessonHint: { fontSize: 12, color: "#888", marginTop: 4 },
  lessonBody: { fontSize: 13, color: "#333", marginTop: 6, lineHeight: 19 },
  checkbox: { fontSize: 20 },
  joinLiveButton: { marginTop: 8, alignSelf: "flex-start", borderWidth: 1, borderColor: "#111", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  joinLiveButtonText: { fontSize: 12, fontWeight: "600" },
  ratingRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  ratingStar: { fontSize: 24, color: "#111" },
  reviewInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, fontSize: 13, minHeight: 70, textAlignVertical: "top", marginBottom: 12 },
  deleteReviewButton: { marginTop: 8, alignItems: "center" },
  deleteReviewButtonText: { color: "#b00020", fontSize: 13, fontWeight: "600" },
  reviewRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f5f5f5" },
});
