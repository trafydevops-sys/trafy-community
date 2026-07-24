"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import type { Cohort, CourseDetail, LessonContentType, PricingType } from "@trafy-community/core";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { uploadFile } from "@/lib/upload";
import { formatMoney } from "@/lib/format";

export default function CourseBuilderPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pricingType, setPricingType] = useState<PricingType>("free");
  const [priceCents, setPriceCents] = useState(0);

  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [addingModule, setAddingModule] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const detail = await withAuthRetry(() => trpc.courses.getById.query({ courseId }));
      setCourse(detail);
      setTitle(detail.title);
      setDescription(detail.description ?? "");
      setPricingType(detail.pricingType);
      setPriceCents(detail.priceCents);
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

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await withAuthRetry(() =>
        trpc.courses.update.mutate({
          courseId,
          title,
          description: description || undefined,
          pricingType,
          priceCents: pricingType === "free" ? 0 : priceCents,
        })
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish() {
    if (!course) return;
    setError(null);
    try {
      await withAuthRetry(() => trpc.courses.setPublished.mutate({ courseId, published: !course.published }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update publish status.");
    }
  }

  async function handleAddModule(e: FormEvent) {
    e.preventDefault();
    if (!newModuleTitle.trim()) return;
    setAddingModule(true);
    setError(null);
    try {
      await withAuthRetry(() => trpc.courses.addModule.mutate({ courseId, title: newModuleTitle.trim() }));
      setNewModuleTitle("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add module.");
    } finally {
      setAddingModule(false);
    }
  }

  if (loading) {
    return (
      <AppShell active="teach">
        <p className="hint">Loading…</p>
      </AppShell>
    );
  }

  if (!course) {
    return (
      <AppShell active="teach">
        <div className="error-banner">{error ?? "Course not found."}</div>
      </AppShell>
    );
  }

  return (
    <AppShell active="teach">
      <div className="brand">Edit course</div>
      <p className="subtitle">
        {course.published ? "Published" : "Draft"} · {formatMoney(course.priceCents, course.currency)} ·{" "}
        {course.enrollmentCount} enrolled{course.organizationName ? ` · published under ${course.organizationName}` : ""}
      </p>
      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <form onSubmit={handleSave}>
          <div className="field">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Pricing</label>
              <select value={pricingType} onChange={(e) => setPricingType(e.target.value as PricingType)}>
                <option value="free">Free</option>
                <option value="paid">Paid</option>
                <option value="live">Live cohort</option>
              </select>
            </div>
            {pricingType !== "free" && (
              <div className="field" style={{ flex: 1 }}>
                <label>Price (USD)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={priceCents / 100}
                  onChange={(e) => setPriceCents(Math.round(Number(e.target.value) * 100))}
                />
              </div>
            )}
          </div>
          <div className="row-actions">
            <button type="button" className="secondary" onClick={togglePublish}>
              {course.published ? "Unpublish" : "Publish"}
            </button>
            <button className="primary" type="submit" disabled={saving} style={{ flex: 1, marginLeft: 12 }}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>

      <div className="section-title" style={{ marginTop: 0 }}>
        Curriculum
      </div>

      {course.modules.map((mod) => (
        <ModuleEditor key={mod.id} moduleId={mod.id} title={mod.title} lessons={mod.lessons} onChanged={load} />
      ))}

      <div className="card">
        <form onSubmit={handleAddModule} style={{ display: "flex", gap: 10 }}>
          <input
            value={newModuleTitle}
            onChange={(e) => setNewModuleTitle(e.target.value)}
            placeholder="New module title"
            style={{ flex: 1 }}
          />
          <button className="primary" type="submit" disabled={addingModule || !newModuleTitle.trim()} style={{ width: "auto", padding: "10px 18px" }}>
            {addingModule ? "Adding…" : "Add module"}
          </button>
        </form>
      </div>

      <div className="section-title">Cohorts</div>
      <CohortManager courseId={courseId} cohorts={course.cohorts} onChanged={load} />
    </AppShell>
  );
}

function CohortManager({
  courseId,
  cohorts,
  onChanged,
}: {
  courseId: string;
  cohorts: Cohort[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [capacity, setCapacity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !startDate || !endDate) return;
    setBusy(true);
    setError(null);
    try {
      await withAuthRetry(() =>
        trpc.courses.createCohort.mutate({
          courseId,
          name: name.trim(),
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          capacity: capacity ? Number(capacity) : undefined,
        })
      );
      setName("");
      setStartDate("");
      setEndDate("");
      setCapacity("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the cohort.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      {cohorts.length === 0 ? (
        <p className="hint" style={{ marginTop: 0 }}>
          No scheduled cohorts yet — self-paced enrollment is always available. Add a cohort to offer a scheduled batch instead.
        </p>
      ) : (
        cohorts.map((c) => (
          <div className="milestone-row" key={c.id}>
            <div>
              <strong>{c.name}</strong>
              <div className="hint">
                {new Date(c.startDate).toLocaleDateString()} – {new Date(c.endDate).toLocaleDateString()}
              </div>
            </div>
            <span className="hint">
              {c.enrolledCount} enrolled{c.capacity != null ? ` / ${c.capacity} seats (${c.seatsLeft} left)` : ""}
            </span>
          </div>
        ))
      )}

      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleCreate} style={{ marginTop: cohorts.length ? 16 : 0 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cohort name (e.g. Fall 2026)" style={{ flex: 2 }} />
          <input
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="Capacity (optional)"
            style={{ flex: 1 }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ flex: 1 }} />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ flex: 1 }} />
        </div>
        <button className="secondary" type="submit" disabled={busy || !name.trim() || !startDate || !endDate}>
          {busy ? "Adding…" : "Add cohort"}
        </button>
      </form>
    </div>
  );
}

function ModuleEditor({
  moduleId,
  title,
  lessons,
  onChanged,
}: {
  moduleId: string;
  title: string;
  lessons: CourseDetail["modules"][number]["lessons"];
  onChanged: () => void;
}) {
  const [lessonTitle, setLessonTitle] = useState("");
  const [contentType, setContentType] = useState<LessonContentType>("text");
  const [textContent, setTextContent] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddLesson(e: FormEvent) {
    e.preventDefault();
    if (!lessonTitle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      let videoUrl: string | undefined;
      if (contentType === "video" && file) {
        const uploaded = await uploadFile("course_video", file);
        videoUrl = uploaded.url;
      }
      await withAuthRetry(() =>
        trpc.courses.addLesson.mutate({
          moduleId,
          title: lessonTitle.trim(),
          contentType,
          videoUrl,
          textContent: contentType === "text" ? textContent || undefined : undefined,
          scheduledAt: contentType === "live" && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
          isSample,
        })
      );
      setLessonTitle("");
      setTextContent("");
      setScheduledAt("");
      setFile(null);
      setIsSample(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add lesson.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="module-block">
      <h4>{title}</h4>
      {lessons.map((l) => (
        <div className="lesson-row" key={l.id}>
          <div className="lesson-title">
            {l.title} <span className="hint">({l.contentType})</span>
            {l.isSample && <span className="badge" style={{ marginLeft: 8 }}>Sample</span>}
          </div>
        </div>
      ))}

      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleAddLesson} style={{ marginTop: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            value={lessonTitle}
            onChange={(e) => setLessonTitle(e.target.value)}
            placeholder="Lesson title"
            style={{ flex: 1, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8 }}
          />
          <select
            value={contentType}
            onChange={(e) => setContentType(e.target.value as LessonContentType)}
            style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8 }}
          >
            <option value="text">Text</option>
            <option value="video">Video</option>
            <option value="live">Live session</option>
          </select>
        </div>
        {contentType === "text" && (
          <textarea rows={2} value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="Lesson content" style={{ width: "100%", marginBottom: 8 }} />
        )}
        {contentType === "video" && (
          <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ marginBottom: 8 }} />
        )}
        {contentType === "live" && (
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            style={{ marginBottom: 8, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8 }}
          />
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 13 }}>
          <input type="checkbox" checked={isSample} onChange={(e) => setIsSample(e.target.checked)} />
          Sample lesson (free preview, even in a paid course)
        </label>
        <button className="secondary" type="submit" disabled={busy || !lessonTitle.trim()}>
          {busy ? "Adding…" : "Add lesson"}
        </button>
      </form>
    </div>
  );
}
