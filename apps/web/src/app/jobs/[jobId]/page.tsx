"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import type { JobDetail } from "@trafy-community/core";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { formatMoney } from "@/lib/format";

export default function JobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;

  const [job, setJob] = useState<JobDetail | null>(null);
  const [coverNote, setCoverNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const detail = await withAuthRetry(() => trpc.jobs.getById.query({ jobId }));
      setJob(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this job.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function handleApply(e: FormEvent) {
    e.preventDefault();
    setApplying(true);
    setError(null);
    try {
      await withAuthRetry(() => trpc.applications.apply.mutate({ jobId, coverNote: coverNote || undefined }));
      setNotice("Application submitted!");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your application.");
    } finally {
      setApplying(false);
    }
  }

  if (loading) {
    return (
      <AppShell active="jobs">
        <p className="hint">Loading…</p>
      </AppShell>
    );
  }

  if (!job) {
    return (
      <AppShell active="jobs">
        <div className="error-banner">{error ?? "Job not found."}</div>
      </AppShell>
    );
  }

  const compMax = job.compensationMaxCents && job.compensationMaxCents !== job.compensationMinCents ? `–${formatMoney(job.compensationMaxCents, job.currency)}` : "";
  const compSuffix = job.compensationType === "hourly" ? "/hr" : job.compensationType === "salary" ? "/yr" : "";

  return (
    <AppShell active="jobs">
      <span className="job-type-badge">{job.jobType.replace("_", " ")}</span>
      <div className="brand" style={{ marginTop: 8 }}>
        {job.title}
      </div>
      <p className="subtitle">
        {job.posterName} {job.location ? `· ${job.location}` : ""} · {formatMoney(job.compensationMinCents, job.currency)}
        {compMax}
        {compSuffix}
      </p>
      {job.description && <p>{job.description}</p>}
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="dev-code-banner">{notice}</div>}

      <div className="card">
        {job.myApplicationStatus ? (
          <p style={{ marginTop: 0 }}>
            You applied to this job — status: <span className="badge">{job.myApplicationStatus}</span>
          </p>
        ) : (
          <form onSubmit={handleApply}>
            <div className="field">
              <label>Cover note (optional)</label>
              <textarea rows={4} value={coverNote} onChange={(e) => setCoverNote(e.target.value)} placeholder="Why you're a fit…" />
            </div>
            <button className="primary" type="submit" disabled={applying}>
              {applying ? "Submitting…" : "Apply"}
            </button>
          </form>
        )}
      </div>
    </AppShell>
  );
}
