"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Contract } from "@trafy-community/core";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { useAuth } from "@/lib/auth-context";
import { formatMoney } from "@/lib/format";

export default function ContractsPage() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    withAuthRetry(() => trpc.contracts.listMine.query())
      .then(setContracts)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load contracts."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell active="contracts">
      <div className="brand">Contracts</div>
      <p className="subtitle">Engagements you're hiring for or working on.</p>
      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="hint">Loading…</p>
      ) : contracts.length === 0 ? (
        <p className="hint">No contracts yet — create one from a job's pipeline after making an offer.</p>
      ) : (
        contracts.map((c) => {
          const isEmployer = c.employerId === user?.id;
          return (
            <Link key={c.id} href={`/contracts/${c.id}`} className="job-card" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="job-head">
                <div>
                  <span className="badge" style={{ background: c.status === "completed" ? "var(--accent)" : "var(--line)" }}>
                    {c.status}
                  </span>
                  <h3 style={{ margin: "6px 0 2px" }}>{c.title}</h3>
                  <span className="hint">
                    {isEmployer ? `with ${c.talentName}` : `for ${c.employerName}`} · {c.jobTitle}
                  </span>
                </div>
                <strong>
                  {formatMoney(c.releasedCents, c.currency)} / {formatMoney(c.totalCents, c.currency)}
                </strong>
              </div>
            </Link>
          );
        })
      )}
    </AppShell>
  );
}
