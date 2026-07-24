"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Application, ApplicationStatus } from "@trafy-community/core";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";

const COLUMNS: { key: ApplicationStatus; label: string }[] = [
  { key: "applied", label: "Applied" },
  { key: "reviewing", label: "Reviewing" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer" },
  { key: "hired", label: "Hired" },
];

export default function PipelinePage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;

  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contractFor, setContractFor] = useState<Application | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rows = await withAuthRetry(() => trpc.applications.listForJob.query({ jobId }));
      setApplications(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load applications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function changeStatus(applicationId: string, status: ApplicationStatus) {
    setError(null);
    try {
      await withAuthRetry(() => trpc.applications.updateStatus.mutate({ applicationId, status }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
    }
  }

  return (
    <AppShell active="hire">
      <div className="brand">Pipeline</div>
      <p className="subtitle">Move candidates through your hiring stages.</p>
      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="hint">Loading…</p>
      ) : applications.length === 0 ? (
        <p className="hint">No applications yet.</p>
      ) : (
        <div className="pipeline-board">
          {COLUMNS.map((col) => (
            <div className="pipeline-column" key={col.key}>
              <h5>{col.label}</h5>
              {applications
                .filter((a) => a.status === col.key)
                .map((a) => (
                  <div className="pipeline-card" key={a.id}>
                    <strong>{a.applicantName}</strong>
                    {a.coverNote && <p className="hint" style={{ margin: "4px 0" }}>{a.coverNote.slice(0, 80)}</p>}
                    <select value={a.status} onChange={(e) => changeStatus(a.id, e.target.value as ApplicationStatus)}>
                      {COLUMNS.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                      <option value="rejected">Rejected</option>
                    </select>
                    {a.hasContract ? (
                      <span className="badge" style={{ marginTop: 8, display: "inline-block" }}>
                        Contract created
                      </span>
                    ) : (
                      (col.key === "offer" || col.key === "hired") && (
                        <button
                          className="secondary"
                          style={{ marginTop: 8, width: "100%", fontSize: 12, padding: "5px" }}
                          onClick={() => setContractFor(a)}
                        >
                          Create contract
                        </button>
                      )
                    )}
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}

      {applications.some((a) => a.status === "rejected") && (
        <>
          <div className="section-title">Rejected</div>
          {applications
            .filter((a) => a.status === "rejected")
            .map((a) => (
              <div className="pipeline-card" key={a.id} style={{ maxWidth: 300 }}>
                <strong>{a.applicantName}</strong>
              </div>
            ))}
        </>
      )}

      {contractFor && (
        <ContractModal
          application={contractFor}
          onClose={() => setContractFor(null)}
          onCreated={() => {
            setContractFor(null);
            load();
          }}
        />
      )}
    </AppShell>
  );
}

function ContractModal({
  application,
  onClose,
  onCreated,
}: {
  application: Application;
  onClose: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(`${application.jobTitle} — ${application.applicantName}`);
  const [milestones, setMilestones] = useState([{ title: "Milestone 1", amount: 100 }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const contract = await withAuthRetry(() =>
        trpc.contracts.create.mutate({
          applicationId: application.id,
          title,
          milestones: milestones.map((m) => ({ title: m.title, amountCents: Math.round(m.amount * 100) })),
        })
      );
      onCreated();
      router.push(`/contracts/${contract.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the contract.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20 }}>
      <div className="card" style={{ maxWidth: 480, width: "90%" }}>
        <div className="section-title" style={{ marginTop: 0 }}>
          Create contract for {application.applicantName}
        </div>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleCreate}>
          <div className="field">
            <label>Contract title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="field">
            <label>Milestones</label>
            {milestones.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  value={m.title}
                  onChange={(e) => setMilestones((ms) => ms.map((x, xi) => (xi === i ? { ...x, title: e.target.value } : x)))}
                  style={{ flex: 2 }}
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={m.amount}
                  onChange={(e) => setMilestones((ms) => ms.map((x, xi) => (xi === i ? { ...x, amount: Number(e.target.value) } : x)))}
                  style={{ flex: 1 }}
                />
              </div>
            ))}
            <button type="button" className="link" onClick={() => setMilestones((ms) => [...ms, { title: `Milestone ${ms.length + 1}`, amount: 100 }])}>
              + Add milestone
            </button>
          </div>
          <div className="row-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" type="submit" disabled={busy} style={{ flex: 1, marginLeft: 12 }}>
              {busy ? "Creating…" : "Create contract"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
