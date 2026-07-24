"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { JobSummary, JobType } from "@trafy-community/core";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { formatMoney } from "@/lib/format";

function compensationLabel(job: JobSummary): string {
  const min = formatMoney(job.compensationMinCents, job.currency);
  const suffix = job.compensationType === "hourly" ? "/hr" : job.compensationType === "salary" ? "/yr" : "";
  if (job.compensationMaxCents && job.compensationMaxCents !== job.compensationMinCents) {
    return `${min}–${formatMoney(job.compensationMaxCents, job.currency)}${suffix}`;
  }
  return `${min}${suffix}`;
}

export default function JobsPage() {
  const [query, setQuery] = useState("");
  const [jobType, setJobType] = useState<JobType | "">("");
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(q?: string, type?: JobType) {
    setLoading(true);
    setError(null);
    try {
      const found = await withAuthRetry(() => trpc.jobs.listPublished.query({ query: q, jobType: type }));
      setJobs(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load jobs.");
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
    load(query.trim() || undefined, jobType || undefined);
  }

  return (
    <AppShell active="jobs">
      <div className="brand">Jobs</div>
      <p className="subtitle">Full-time roles, contracts, and freelance work from the community.</p>
      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSearch} style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search jobs…"
          style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8 }}
        />
        <select
          value={jobType}
          onChange={(e) => setJobType(e.target.value as JobType | "")}
          style={{ padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8 }}
        >
          <option value="">All types</option>
          <option value="full_time">Full-time</option>
          <option value="contract">Contract</option>
          <option value="freelance">Freelance</option>
        </select>
        <button className="primary" type="submit" style={{ width: "auto", padding: "10px 20px" }}>
          Search
        </button>
      </form>

      {loading ? (
        <p className="hint">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="hint">No published jobs yet — post one from Hire.</p>
      ) : (
        jobs.map((job) => (
          <Link key={job.id} href={`/jobs/${job.id}`} className="job-card" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="job-head">
              <div>
                <span className="job-type-badge">{job.jobType.replace("_", " ")}</span>
                <h3 style={{ margin: "6px 0 2px" }}>{job.title}</h3>
                <span className="hint">
                  {job.posterName} {job.location ? `· ${job.location}` : ""}
                </span>
              </div>
              <strong style={{ whiteSpace: "nowrap" }}>{compensationLabel(job)}</strong>
            </div>
            {job.description && <p style={{ margin: 0, fontSize: 14 }}>{job.description}</p>}
            <span className="hint">
              {job.applicationCount} application{job.applicationCount === 1 ? "" : "s"}
            </span>
          </Link>
        ))
      )}
    </AppShell>
  );
}
