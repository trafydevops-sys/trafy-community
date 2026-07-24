"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { CourseDetail } from "@trafy-community/core";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { formatMoney } from "@/lib/format";

export default function CourseDetailPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cohortId, setCohortId] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [savingReview, setSavingReview] = useState(false);

  async function load() {
    setLoading(true);
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

  async function handleEnroll() {
    setBuying(true);
    setError(null);
    try {
      const result = await withAuthRetry(() => trpc.payments.checkout.mutate({ courseId, cohortId: cohortId || undefined }));
      setNotice(
        result.stub
          ? `Test payment completed — ${formatMoney(result.amountCents, result.currency)} (no payment gateway configured yet).`
          : "Enrolled!"
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete checkout.");
    } finally {
      setBuying(false);
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
      await load(); // refresh progressPercent
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update progress.");
    }
  }

  if (loading) {
    return (
      <AppShell active="learn">
        <p className="hint">Loading…</p>
      </AppShell>
    );
  }

  if (error && !course) {
    return (
      <AppShell active="learn">
        <div className="error-banner">{error}</div>
      </AppShell>
    );
  }

  if (!course) return null;

  return (
    <AppShell active="learn">
      <span className={`price-badge ${course.priceCents === 0 ? "free" : ""}`}>
        {course.pricingType === "live" ? "Live · " : ""}
        {formatMoney(course.priceCents, course.currency)}
      </span>
      <div className="brand" style={{ marginTop: 8 }}>
        {course.title}
      </div>
      <p className="subtitle">
        by {course.creatorName}
        {course.organizationName ? ` · ${course.organizationName}` : ""} · {course.enrollmentCount} enrolled
      </p>
      {course.description && <p>{course.description}</p>}
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="dev-code-banner">{notice}</div>}

      {!course.enrolled ? (
        <div className="card" style={{ marginBottom: 20 }}>
          <p style={{ marginTop: 0 }}>
            {course.pricingType === "free" ? "This course is free." : `Enroll for ${formatMoney(course.priceCents, course.currency)}.`}
          </p>
          {course.cohorts.length > 0 && (
            <div className="field">
              <label>Cohort</label>
              <select value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
                <option value="">Self-paced (no fixed schedule)</option>
                {course.cohorts.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.seatsLeft === 0}>
                    {c.name} · {new Date(c.startDate).toLocaleDateString()}–{new Date(c.endDate).toLocaleDateString()}
                    {c.capacity != null ? ` (${c.seatsLeft} seats left)` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button className="primary" onClick={handleEnroll} disabled={buying}>
            {buying ? "Processing…" : course.pricingType === "free" ? "Enroll for free" : `Buy — ${formatMoney(course.priceCents, course.currency)}`}
          </button>
        </div>
      ) : (
        <div className="progress-track" style={{ marginBottom: 20 }}>
          <div className="progress-fill" style={{ width: `${course.progressPercent}%` }} />
        </div>
      )}

      {course.modules.length === 0 ? (
        <p className="hint">No lessons published yet.</p>
      ) : (
        course.modules.map((mod) => (
          <div className="module-block" key={mod.id}>
            <h4>{mod.title}</h4>
            {mod.lessons.map((lesson) => (
              <div className={`lesson-row ${lesson.locked ? "locked" : ""}`} key={lesson.id}>
                {course.enrolled && (
                  <input type="checkbox" checked={lesson.completed} onChange={(e) => toggleLesson(lesson.id, e.target.checked)} />
                )}
                <div style={{ flex: 1 }}>
                  <div className="lesson-title">
                    {lesson.title} {lesson.locked && "🔒"}
                    {lesson.isSample && !course.enrolled && <span className="badge" style={{ marginLeft: 8 }}>Sample</span>}
                  </div>
                  {lesson.contentType === "live" && lesson.scheduledAt && (
                    <div>
                      <span className="hint">Live session: {new Date(lesson.scheduledAt).toLocaleString()}</span>
                      {!lesson.locked && (
                        <Link href={`/live/${lesson.id}`} target="_blank" style={{ marginLeft: 8 }}>
                          <button className="secondary" style={{ padding: "4px 10px", fontSize: 12 }}>
                            Join live class
                          </button>
                        </Link>
                      )}
                    </div>
                  )}
                  {!lesson.locked && lesson.contentType === "video" && lesson.videoUrl && (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video src={lesson.videoUrl} controls />
                  )}
                  {!lesson.locked && lesson.contentType === "text" && lesson.textContent && (
                    <p style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{lesson.textContent}</p>
                  )}
                  {lesson.locked && <p className="hint">Enroll to unlock this lesson.</p>}
                </div>
              </div>
            ))}
          </div>
        ))
      )}

      <div className="module-block">
        <h4>
          Reviews {course.reviewCount > 0 && `· ${course.avgRating?.toFixed(1)} ★ (${course.reviewCount})`}
        </h4>

        {course.completed ? (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="field">
              <label>Your rating</label>
              <select value={reviewRating} onChange={(e) => setReviewRating(Number(e.target.value))}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {"★".repeat(n)} ({n})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Comment (optional)</label>
              <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} rows={3} maxLength={2000} />
            </div>
            <button className="primary" onClick={handleSubmitReview} disabled={savingReview}>
              {savingReview ? "Saving…" : course.myReview ? "Update review" : "Submit review"}
            </button>
            {course.myReview && (
              <button className="secondary" style={{ marginLeft: 8 }} onClick={handleDeleteReview} disabled={savingReview}>
                Delete review
              </button>
            )}
          </div>
        ) : (
          <p className="hint">Finish the course to leave a review.</p>
        )}

        {course.reviews.length === 0 ? (
          <p className="hint">No reviews yet.</p>
        ) : (
          course.reviews.map((r) => (
            <div className="lesson-row" key={r.id}>
              <div style={{ flex: 1 }}>
                <div className="lesson-title">
                  {"★".repeat(r.rating)}
                  {"☆".repeat(5 - r.rating)} · {r.authorName || "Anonymous"}
                </div>
                {r.comment && (
                  <p style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{r.comment}</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}
