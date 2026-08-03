"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { CourseSummary, OrganizationDetail, OrgRole, Batch } from "@trafy-community/core";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { useAuth } from "@/lib/auth-context";
import { formatMoney } from "@/lib/format";
import {
  Box, Typography, Button, Drawer, TextField, MenuItem,
  Card, CardContent, Grid, Chip, Divider, Dialog, DialogTitle,
  DialogContent, DialogActions
} from "@mui/material";

export default function OrganizationDetailPage() {
  const params = useParams<{ orgId: string }>();
  const organizationId = params.orgId;
  const { user } = useAuth();

  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("instructor");
  const [inviting, setInviting] = useState(false);

  // Edit Profile Drawer
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    about: "", logoUrl: "", bannerUrl: "", website: "", industry: "", employeeRange: "", location: "", foundedYear: "", linkedinUrl: ""
  });

  // Batch Dialog
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchForm, setBatchForm] = useState({
    name: "", description: "", startDate: "", endDate: "", capacity: ""
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const detail = await withAuthRetry(() => trpc.organizations.getById.query({ organizationId }));
      setOrg(detail);
      setEditForm({
        about: detail.about || "",
        logoUrl: detail.logoUrl || "",
        bannerUrl: detail.bannerUrl || "",
        website: detail.website || "",
        industry: detail.industry || "",
        employeeRange: detail.employeeRange || "",
        location: detail.location || "",
        foundedYear: detail.foundedYear?.toString() || "",
        linkedinUrl: detail.linkedinUrl || "",
      });

      const orgCourses = await withAuthRetry(() => trpc.courses.listByOrg.query({ organizationId }));
      setCourses(orgCourses);

      if (detail.type === "institution") {
        const orgBatches = await withAuthRetry(() => trpc.batches.list.query({ organizationId }));
        setBatches(orgBatches);
      }
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

  async function handleUpdateProfile(e: FormEvent) {
    e.preventDefault();
    try {
      await withAuthRetry(() => trpc.organizations.update.mutate({
        organizationId,
        about: editForm.about,
        logoUrl: editForm.logoUrl,
        bannerUrl: editForm.bannerUrl,
        website: editForm.website,
        industry: editForm.industry,
        employeeRange: editForm.employeeRange,
        location: editForm.location,
        foundedYear: editForm.foundedYear ? parseInt(editForm.foundedYear) : undefined,
        linkedinUrl: editForm.linkedinUrl,
      }));
      setEditDrawerOpen(false);
      setNotice("Profile updated successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update profile.");
    }
  }

  async function handleCreateBatch(e: FormEvent) {
    e.preventDefault();
    try {
      await withAuthRetry(() => trpc.batches.create.mutate({
        organizationId,
        name: batchForm.name,
        description: batchForm.description,
        startDate: new Date(batchForm.startDate).toISOString(),
        endDate: batchForm.endDate ? new Date(batchForm.endDate).toISOString() : undefined,
        capacity: batchForm.capacity ? parseInt(batchForm.capacity) : undefined,
      }));
      setBatchDialogOpen(false);
      setNotice("Batch created successfully.");
      setBatchForm({ name: "", description: "", startDate: "", endDate: "", capacity: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create batch.");
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
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: "bold" }}>{org.name}</Typography>
        <Box sx={{ display: "flex", gap: 2 }}>
          <Button variant="outlined" component={Link} href={`/company/${org.slug}`}>View Public Page</Button>
          {canManage && (
            <Button variant="contained" onClick={() => setEditDrawerOpen(true)}>Edit Profile</Button>
          )}
        </Box>
      </Box>

      <p className="subtitle" style={{ marginBottom: 24 }}>
        <span className="badge">{org.myRole}</span> · {org.type} · {org.memberCount} member{org.memberCount === 1 ? "" : "s"} · {org.courseCount} course{org.courseCount === 1 ? "" : "s"}
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

      {org.type === "institution" && (
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: "bold" }}>Batches</Typography>
            {canManage && (
              <Button variant="outlined" size="small" onClick={() => setBatchDialogOpen(true)}>Create Batch</Button>
            )}
          </Box>
          {batches.length === 0 ? (
            <Typography color="text.secondary">No batches created yet.</Typography>
          ) : (
            <Grid container spacing={2}>
              {batches.map(batch => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={batch.id}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6">{batch.name}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {new Date(batch.startDate).toLocaleDateString()}
                      </Typography>
                      <Box sx={{ display: "flex", gap: 1 }}>
                        <Chip size="small" label={`${batch.studentCount} Students`} />
                        <Chip size="small" label={`${batch.placementRate.toFixed(1)}% Placed`} color="success" />
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

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

      {/* Edit Profile Drawer */}
      <Drawer anchor="right" open={editDrawerOpen} onClose={() => setEditDrawerOpen(false)}>
        <Box sx={{ width: 400, p: 3 }}>
          <Typography variant="h6" sx={{ mb: 3 }}>Edit Organization Profile</Typography>
          <form onSubmit={handleUpdateProfile}>
            <TextField fullWidth margin="normal" label="About" multiline rows={4} value={editForm.about} onChange={(e) => setEditForm({...editForm, about: e.target.value})} />
            <TextField fullWidth margin="normal" label="Logo URL" value={editForm.logoUrl} onChange={(e) => setEditForm({...editForm, logoUrl: e.target.value})} />
            <TextField fullWidth margin="normal" label="Banner URL" value={editForm.bannerUrl} onChange={(e) => setEditForm({...editForm, bannerUrl: e.target.value})} />
            <TextField fullWidth margin="normal" label="Website" value={editForm.website} onChange={(e) => setEditForm({...editForm, website: e.target.value})} />
            <TextField fullWidth margin="normal" label="Industry" value={editForm.industry} onChange={(e) => setEditForm({...editForm, industry: e.target.value})} />
            <TextField fullWidth margin="normal" label="Employee Range" value={editForm.employeeRange} onChange={(e) => setEditForm({...editForm, employeeRange: e.target.value})} select>
              <MenuItem value="1-10">1-10</MenuItem>
              <MenuItem value="11-50">11-50</MenuItem>
              <MenuItem value="51-200">51-200</MenuItem>
              <MenuItem value="201-1000">201-1000</MenuItem>
              <MenuItem value="1000+">1000+</MenuItem>
            </TextField>
            <TextField fullWidth margin="normal" label="Location" value={editForm.location} onChange={(e) => setEditForm({...editForm, location: e.target.value})} />
            <TextField fullWidth margin="normal" label="Founded Year" type="number" value={editForm.foundedYear} onChange={(e) => setEditForm({...editForm, foundedYear: e.target.value})} />
            <TextField fullWidth margin="normal" label="LinkedIn URL" value={editForm.linkedinUrl} onChange={(e) => setEditForm({...editForm, linkedinUrl: e.target.value})} />
            
            <Box sx={{ mt: 3, display: "flex", gap: 2 }}>
              <Button variant="contained" type="submit">Save Changes</Button>
              <Button variant="text" onClick={() => setEditDrawerOpen(false)}>Cancel</Button>
            </Box>
          </form>
        </Box>
      </Drawer>

      {/* Create Batch Dialog */}
      <Dialog open={batchDialogOpen} onClose={() => setBatchDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Batch</DialogTitle>
        <form onSubmit={handleCreateBatch}>
          <DialogContent>
            <TextField fullWidth margin="normal" label="Batch Name" required value={batchForm.name} onChange={(e) => setBatchForm({...batchForm, name: e.target.value})} />
            <TextField fullWidth margin="normal" label="Description" multiline rows={2} value={batchForm.description} onChange={(e) => setBatchForm({...batchForm, description: e.target.value})} />
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <TextField fullWidth margin="normal" label="Start Date" type="date" slotProps={{ inputLabel: { shrink: true } }} required value={batchForm.startDate} onChange={(e) => setBatchForm({...batchForm, startDate: e.target.value})} />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField fullWidth margin="normal" label="End Date (Optional)" type="date" slotProps={{ inputLabel: { shrink: true } }} value={batchForm.endDate} onChange={(e) => setBatchForm({...batchForm, endDate: e.target.value})} />
              </Grid>
            </Grid>
            <TextField fullWidth margin="normal" label="Capacity (Optional)" type="number" value={batchForm.capacity} onChange={(e) => setBatchForm({...batchForm, capacity: e.target.value})} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setBatchDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">Create Batch</Button>
          </DialogActions>
        </form>
      </Dialog>

    </AppShell>
  );
}
