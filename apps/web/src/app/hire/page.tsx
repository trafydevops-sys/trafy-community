"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { CompensationType, JobSummary, JobType } from "@trafy-community/core";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { formatMoney } from "@/lib/format";

export default function HirePage() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [jobType, setJobType] = useState<JobType>("full_time");
  const [compensationType, setCompensationType] = useState<CompensationType>("salary");
  const [compMin, setCompMin] = useState(0);
  const [compMax, setCompMax] = useState(0);
  const [location, setLocation] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const mine = await withAuthRetry(() => trpc.jobs.listMine.query());
      setJobs(mine);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your job postings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await withAuthRetry(() =>
        trpc.jobs.create.mutate({
          title,
          description: description || undefined,
          jobType,
          compensationType,
          compensationMinCents: Math.round(compMin * 100),
          compensationMaxCents: compMax > 0 ? Math.round(compMax * 100) : undefined,
          location: location || undefined,
        })
      );
      setTitle("");
      setDescription("");
      setCompMin(0);
      setCompMax(0);
      setLocation("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the job posting.");
    } finally {
      setCreating(false);
    }
  }

  async function togglePublish(job: JobSummary) {
    setError(null);
    try {
      await withAuthRetry(() => trpc.jobs.setPublished.mutate({ jobId: job.id, published: !job.published }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update publish status.");
    }
  }

  return (
    <AppShell active="hire">
      <div className="brand">Hire</div>
      <p className="subtitle">Post jobs and manage your applicant pipeline.</p>
      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title" style={{ marginTop: 0 }}>
          Post a job
        </div>
        <form onSubmit={handleCreate}>
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
              <label>Type</label>
              <select value={jobType} onChange={(e) => setJobType(e.target.value as JobType)}>
                <option value="full_time">Full-time</option>
                <option value="contract">Contract</option>
                <option value="freelance">Freelance</option>
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Compensation type</label>
              <select value={compensationType} onChange={(e) => setCompensationType(e.target.value as CompensationType)}>
                <option value="salary">Salary (/yr)</option>
                <option value="hourly">Hourly</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Min (USD)</label>
              <input type="number" min={0} step="0.01" value={compMin} onChange={(e) => setCompMin(Number(e.target.value))} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Max (USD, optional)</label>
              <input type="number" min={0} step="0.01" value={compMax} onChange={(e) => setCompMax(Number(e.target.value))} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Location</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Remote" />
            </div>
          </div>
          <button className="primary" type="submit" disabled={creating || !title.trim()}>
            {creating ? "Posting…" : "Post job"}
          </button>
        </form>
      </div>

      {loading ? (
        <p className="hint">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="hint">You haven't posted any jobs yet.</p>
      ) : (
        jobs.map((job) => (
          <div className="job-card" key={job.id}>
            <div className="job-head">
              <div>
                <span className="badge" style={{ background: job.published ? "var(--accent)" : "var(--line)" }}>
                  {job.published ? "Published" : "Draft"}
                </span>
                <h3 style={{ margin: "6px 0 2px" }}>{job.title}</h3>
                <span className="hint">
                  {formatMoney(job.compensationMinCents, job.currency)} · {job.applicationCount} application
                  {job.applicationCount === 1 ? "" : "s"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <Link href={`/hire/${job.id}`}>
                  <button className="secondary" style={{ padding: "7px 14px" }}>
                    Pipeline
                  </button>
                </Link>
                <button className="secondary" style={{ padding: "7px 14px" }} onClick={() => togglePublish(job)}>
                  {job.published ? "Unpublish" : "Publish"}
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </AppShell>
  );
}
