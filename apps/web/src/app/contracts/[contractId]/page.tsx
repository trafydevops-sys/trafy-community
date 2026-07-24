"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Contract } from "@trafy-community/core";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { useAuth } from "@/lib/auth-context";
import { formatMoney } from "@/lib/format";

export default function ContractDetailPage() {
  const params = useParams<{ contractId: string }>();
  const contractId = params.contractId;
  const { user } = useAuth();

  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const detail = await withAuthRetry(() => trpc.contracts.getById.query({ contractId }));
      setContract(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this contract.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  async function fund(milestoneId: string) {
    setBusyId(milestoneId);
    setError(null);
    try {
      await withAuthRetry(() => trpc.contracts.fundMilestone.mutate({ milestoneId }));
      setNotice("Milestone funded (escrow stub — no real charge was made; see README).");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fund this milestone.");
    } finally {
      setBusyId(null);
    }
  }

  async function release(milestoneId: string) {
    setBusyId(milestoneId);
    setError(null);
    try {
      await withAuthRetry(() => trpc.contracts.releaseMilestone.mutate({ milestoneId }));
      setNotice("Milestone released to the talent.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not release this milestone.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <AppShell active="contracts">
        <p className="hint">Loading…</p>
      </AppShell>
    );
  }

  if (!contract) {
    return (
      <AppShell active="contracts">
        <div className="error-banner">{error ?? "Contract not found."}</div>
      </AppShell>
    );
  }

  const isEmployer = contract.employerId === user?.id;

  return (
    <AppShell active="contracts">
      <div className="brand">{contract.title}</div>
      <p className="subtitle">
        {contract.jobTitle} · {contract.employerName} ↔ {contract.talentName} ·{" "}
        <span className="badge">{contract.status}</span>
      </p>
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="dev-code-banner">{notice}</div>}

      <div className="contract-summary">
        <div className="earnings-tile">
          <div className="value">{formatMoney(contract.totalCents, contract.currency)}</div>
          <div className="label">Total contract value</div>
        </div>
        <div className="earnings-tile">
          <div className="value">{formatMoney(contract.fundedCents, contract.currency)}</div>
          <div className="label">In escrow (funded)</div>
        </div>
        <div className="earnings-tile">
          <div className="value">{formatMoney(contract.releasedCents, contract.currency)}</div>
          <div className="label">Released to talent</div>
        </div>
      </div>

      <div className="section-title" style={{ marginTop: 0 }}>
        Milestones
      </div>
      <div className="card">
        {contract.milestones.map((m) => (
          <div className="milestone-row" key={m.id}>
            <div>
              <strong>{m.title}</strong>
              <div className="hint">{formatMoney(m.amountCents, contract.currency)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className={`milestone-status ${m.status}`}>{m.status}</span>
              {isEmployer && m.status === "pending" && (
                <button className="secondary" style={{ padding: "6px 12px" }} disabled={busyId === m.id} onClick={() => fund(m.id)}>
                  Fund
                </button>
              )}
              {isEmployer && m.status === "funded" && (
                <button className="primary" style={{ width: "auto", padding: "6px 12px" }} disabled={busyId === m.id} onClick={() => release(m.id)}>
                  Release
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
