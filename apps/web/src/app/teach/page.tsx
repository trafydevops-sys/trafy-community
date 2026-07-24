"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { CourseSummary, EarningsSummary, Organization, Payout, PricingType } from "@trafy-community/core";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { formatMoney } from "@/lib/format";

export default function TeachPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pricingType, setPricingType] = useState<PricingType>("free");
  const [priceCents, setPriceCents] = useState(0);
  const [organizationId, setOrganizationId] = useState("");
  const [creating, setCreating] = useState(false);
  const [requestingPayout, setRequestingPayout] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [mine, earn, payoutHistory, myOrgs] = await Promise.all([
        withAuthRetry(() => trpc.courses.listMine.query()),
        withAuthRetry(() => trpc.payments.creatorEarnings.query()),
        withAuthRetry(() => trpc.payments.myPayouts.query()),
        withAuthRetry(() => trpc.organizations.myOrganizations.query()),
      ]);
      setCourses(mine);
      setEarnings(earn);
      setPayouts(payoutHistory);
      setOrgs(myOrgs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your courses.");
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
        trpc.courses.create.mutate({
          title,
          description: description || undefined,
          pricingType,
          priceCents: pricingType === "free" ? 0 : priceCents,
          organizationId: organizationId || undefined,
        })
      );
      setTitle("");
      setDescription("");
      setPricingType("free");
      setPriceCents(0);
      setOrganizationId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the course.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRequestPayout() {
    setRequestingPayout(true);
    setError(null);
    try {
      const result = await withAuthRetry(() => trpc.payments.requestPayout.mutate());
      setNotice(
        result.payout
          ? `Payout requested: ${formatMoney(result.payout.amountCents, result.payout.currency)} (status: ${result.payout.status}).`
          : "Nothing available to withdraw yet."
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request payout.");
    } finally {
      setRequestingPayout(false);
    }
  }

  return (
    <AppShell active="teach">
      <div className="brand">Teach</div>
      <p className="subtitle">Build courses and track your earnings.</p>
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="dev-code-banner">{notice}</div>}

      {earnings && (
        <>
          <div className="earnings-grid">
            <div className="earnings-tile">
              <div className="value">{formatMoney(earnings.availableCents, earnings.currency)}</div>
              <div className="label">Available to withdraw</div>
            </div>
            <div className="earnings-tile">
              <div className="value">{formatMoney(earnings.paidOutCents, earnings.currency)}</div>
              <div className="label">Paid out</div>
            </div>
            <div className="earnings-tile" style={{ display: "flex", alignItems: "center" }}>
              <button className="primary" onClick={handleRequestPayout} disabled={requestingPayout || earnings.availableCents === 0}>
                {requestingPayout ? "Requesting…" : "Request payout"}
              </button>
            </div>
          </div>

          {earnings.byCourse.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: 0 }}>
                Revenue by course (80% creator share)
              </div>
              {earnings.byCourse.map((c) => (
                <p key={c.courseId} className="hint">
                  {c.courseTitle}: {c.salesCount} sale{c.salesCount === 1 ? "" : "s"} ·{" "}
                  {formatMoney(c.creatorShareCents, earnings.currency)} earned
                </p>
              ))}
            </>
          )}

          {payouts.length > 0 && (
            <>
              <div className="section-title">Payout history</div>
              {payouts.map((p) => (
                <p key={p.id} className="hint">
                  {formatMoney(p.amountCents, p.currency)} — {p.status} — {new Date(p.createdAt).toLocaleDateString()}
                </p>
              ))}
            </>
          )}
        </>
      )}

      <div className="card" style={{ margin: "24px 0" }}>
        <div className="section-title" style={{ marginTop: 0 }}>
          Create a course
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
          {orgs.length > 0 && (
            <div className="field">
              <label>Publish under</label>
              <select value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
                <option value="">Myself (personal)</option>
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button className="primary" type="submit" disabled={creating || !title.trim()}>
            {creating ? "Creating…" : "Create course"}
          </button>
        </form>
      </div>

      {loading ? (
        <p className="hint">Loading…</p>
      ) : courses.length === 0 ? (
        <p className="hint">You haven't created any courses yet.</p>
      ) : (
        <div className="course-grid">
          {courses.map((c) => (
            <Link key={c.id} href={`/teach/${c.id}`} className="course-card" style={{ textDecoration: "none", color: "inherit" }}>
              <span className="badge" style={{ background: c.published ? "var(--accent)" : "var(--line)", alignSelf: "flex-start" }}>
                {c.published ? "Published" : "Draft"}
              </span>
              <h3>{c.title}</h3>
              <span className="hint">
                {formatMoney(c.priceCents, c.currency)} · {c.enrollmentCount} enrolled
                {c.organizationName ? ` · ${c.organizationName}` : ""}
              </span>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
