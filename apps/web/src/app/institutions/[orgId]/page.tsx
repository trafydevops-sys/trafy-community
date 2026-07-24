"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { CourseSummary, OrganizationDetail, OrgRole } from "@trafy-community/core";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { useAuth } from "@/lib/auth-context";
import { formatMoney } from "@/lib/format";

export default function OrganizationDetailPage() {
  const params = useParams<{ orgId: string }>();
  const organizationId = params.orgId;
  const { user } = useAuth();

  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("instructor");
  const [inviting, setInviting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [detail, orgCourses] = await Promise.all([
        withAuthRetry(() => trpc.organizations.getById.query({ organizationId })),
        withAuthRetry(() => trpc.courses.listByOrg.query({ organizationId })),
      ]);
      setOrg(detail);
      setCourses(orgCourses);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this organization.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    setError(null);
    setNotice(null);
    try {
      await withAuthRetry(() => trpc.organizations.addMember.mutate({ organizationId, email: email.trim(), role }));
      setNotice(`Added ${email.trim()} as ${role}.`);
      setEmail("");
      setRole("instructor");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that member.");
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(userId: string, newRole: OrgRole) {
    setError(null);
    try {
      await withAuthRetry(() => trpc.organizations.updateMemberRole.mutate({ organizationId, userId, role: newRole }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update role.");
    }
  }

  async function removeMember(userId: string) {
    setError(null);
    try {
      await withAuthRetry(() => trpc.organizations.removeMember.mutate({ organizationId, userId }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that member.");
    }
  }

  if (loading) {
    return (
      <AppShell active="institutions">
        <p className="hint">Loading…</p>
      </AppShell>
    );
  }

  if (!org) {
    return (
      <AppShell active="institutions">
        <div className="error-banner">{error ?? "Organization not found."}</div>
      </AppShell>
    );
  }

  const isOwner = org.ownerId === user?.id;
  const canManage = org.myRole === "owner" || org.myRole === "admin";

  return (
    <AppShell active="institutions">
      <div className="brand">{org.name}</div>
      <p className="subtitle">
        <span className="badge">{org.myRole}</span> · {org.memberCount} member{org.memberCount === 1 ? "" : "s"} · {org.courseCount} course
        {org.courseCount === 1 ? "" : "s"}
      </p>
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="dev-code-banner">{notice}</div>}

      <div className="section-title" style={{ marginTop: 0 }}>
        Members
      </div>
      <div className="card" style={{ marginBottom: 24 }}>
        {org.members.map((m) => (
          <div className="milestone-row" key={m.userId}>
            <div>
              <strong>{m.name || m.email}</strong>
              <div className="hint">{m.email}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {isOwner && m.userId !== org.ownerId ? (
                <select value={m.role} onChange={(e) => changeRole(m.userId, e.target.value as OrgRole)}>
                  <option value="admin">Admin</option>
                  <option value="instructor">Instructor</option>
                </select>
              ) : (
                <span className="badge">{m.role}</span>
              )}
              {isOwner && m.userId !== org.ownerId && (
                <button className="secondary" style={{ padding: "6px 12px" }} onClick={() => removeMember(m.userId)}>
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}

        {canManage && (
          <form onSubmit={handleInvite} style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Teammate's account email"
              style={{ flex: 2 }}
              required
            />
            <select value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
              <option value="instructor">Instructor</option>
              <option value="admin">Admin</option>
            </select>
            <button className="secondary" type="submit" disabled={inviting || !email.trim()}>
              {inviting ? "Adding…" : "Add"}
            </button>
          </form>
        )}
      </div>

      <div className="section-title" style={{ marginTop: 0 }}>
        Courses
      </div>
      {courses.length === 0 ? (
        <p className="hint">No courses published under this organization yet — create one from Teach and pick this organization.</p>
      ) : (
        <div className="course-grid">
          {courses.map((c) => (
            <Link key={c.id} href={`/teach/${c.id}`} className="course-card" style={{ textDecoration: "none", color: "inherit" }}>
              <span className="badge" style={{ background: c.published ? "var(--accent)" : "var(--line)", alignSelf: "flex-start" }}>
                {c.published ? "Published" : "Draft"}
              </span>
              <h3>{c.title}</h3>
              <span className="hint">
                {formatMoney(c.priceCents, c.currency)} · {c.enrollmentCount} enrolled · by {c.creatorName}
              </span>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
