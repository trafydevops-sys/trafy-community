"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { CourseSummary, MyEnrollment } from "@trafy-community/core";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { formatMoney } from "@/lib/format";

export default function LearnPage() {
  const [query, setQuery] = useState("");
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [enrollments, setEnrollments] = useState<MyEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(q?: string) {
    setLoading(true);
    setError(null);
    try {
      const [found, mine] = await Promise.all([
        withAuthRetry(() => trpc.courses.listPublished.query({ query: q })),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    load(query.trim() || undefined);
  }

  const enrolledIds = new Set(enrollments.map((e) => e.course.id));

  return (
    <AppShell active="learn">
      <div className="brand">Learn</div>
      <p className="subtitle">Courses from the community.</p>
      {error && <div className="error-banner">{error}</div>}

      {enrollments.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 0 }}>
            Continue learning
          </div>
          <div className="course-grid" style={{ marginBottom: 28 }}>
            {enrollments.map((e) => (
              <Link key={e.course.id} href={`/learn/${e.course.id}`} className="course-card" style={{ textDecoration: "none", color: "inherit" }}>
                <h3>{e.course.title}</h3>
                <span className="hint">{e.course.creatorName}</span>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${e.progressPercent}%` }} />
                </div>
                <span className="hint">{e.progressPercent}% complete</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <form onSubmit={handleSearch} style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search courses…"
          style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8 }}
        />
        <button className="primary" type="submit" style={{ width: "auto", padding: "10px 20px" }}>
          Search
        </button>
      </form>

      {loading ? (
        <p className="hint">Loading…</p>
      ) : courses.length === 0 ? (
        <p className="hint">No published courses yet — create one from Teach.</p>
      ) : (
        <div className="course-grid">
          {courses.map((c) => (
            <Link key={c.id} href={`/learn/${c.id}`} className="course-card" style={{ textDecoration: "none", color: "inherit" }}>
              <span className={`price-badge ${c.priceCents === 0 ? "free" : ""}`}>
                {c.pricingType === "live" ? "Live · " : ""}
                {formatMoney(c.priceCents, c.currency)}
              </span>
              <h3>{c.title}</h3>
              <span className="hint">by {c.creatorName}{c.organizationName ? ` · ${c.organizationName}` : ""}</span>
              {c.description && <p style={{ fontSize: 13, margin: 0 }}>{c.description}</p>}
              <span className="hint">
                {c.enrollmentCount} enrolled{enrolledIds.has(c.id) ? " · you're enrolled" : ""}
              </span>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
