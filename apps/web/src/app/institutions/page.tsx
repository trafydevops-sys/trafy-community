"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Organization } from "@trafy-community/core";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";

export default function InstitutionsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const mine = await withAuthRetry(() => trpc.organizations.myOrganizations.query());
      setOrgs(mine);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your organizations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await withAuthRetry(() => trpc.organizations.create.mutate({ name: name.trim() }));
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the organization.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppShell active="institutions">
      <div className="brand">Institutions</div>
      <p className="subtitle">Publish courses under an organization, with teammates as instructors.</p>
      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title" style={{ marginTop: 0 }}>
          Create an organization
        </div>
        <form onSubmit={handleCreate} style={{ display: "flex", gap: 10 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Organization name" style={{ flex: 1 }} required />
          <button className="primary" type="submit" disabled={creating || !name.trim()} style={{ width: "auto", padding: "10px 18px" }}>
            {creating ? "Creating…" : "Create"}
          </button>
        </form>
      </div>

      {loading ? (
        <p className="hint">Loading…</p>
      ) : orgs.length === 0 ? (
        <p className="hint">You're not part of any organization yet.</p>
      ) : (
        orgs.map((org) => (
          <Link key={org.id} href={`/institutions/${org.id}`} className="job-card" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="job-head">
              <div>
                <span className="badge">{org.myRole}</span>
                <h3 style={{ margin: "6px 0 2px" }}>{org.name}</h3>
                <span className="hint">
                  {org.memberCount} member{org.memberCount === 1 ? "" : "s"} · {org.courseCount} course
                  {org.courseCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </Link>
        ))
      )}
    </AppShell>
  );
}
