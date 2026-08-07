"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TRPCClientError } from "@trpc/client";
import type { ModUserDetail } from "@trafy-community/core";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof TRPCClientError ? err.message : fallback;
}

const STATUS_COLOR = { active: "success", suspended: "warning", banned: "error" } as const;

const ACTION_LABEL: Record<string, string> = {
  warn: "Warned",
  hide_post: "Hid post",
  restore_post: "Restored post",
  suspend: "Suspended",
  unsuspend: "Unsuspended",
  ban: "Banned",
  unban: "Unbanned",
  trust_score_adjust: "Adjusted trust score",
  dismiss_report: "Dismissed report",
  resolve_report: "Resolved report",
  appeal_approve: "Approved appeal",
  appeal_reject: "Rejected appeal",
  resolve_integrity_flag: "Resolved integrity flag",
};

type DialogKind = "warn" | "suspend" | "ban" | "trust" | null;

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;

  const [user, setUser] = useState<ModUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);

  const [reason, setReason] = useState("");
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("low");
  const [days, setDays] = useState(7);
  const [delta, setDelta] = useState(-10);

  const load = useCallback(async () => {
    setError(null);
    try {
      const detail = await withAuthRetry(() => trpc.moderation.getUser.query({ userId }));
      setUser(detail);
    } catch (err) {
      setError(errorMessage(err, "Could not load this user."));
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  function closeDialog() {
    setDialog(null);
    setReason("");
    setSeverity("low");
    setDays(7);
    setDelta(-10);
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      closeDialog();
      await load();
    } catch (err) {
      setError(errorMessage(err, "That action didn't go through."));
    } finally {
      setBusy(false);
    }
  }

  async function handleUnsuspend() {
    await run(() => withAuthRetry(() => trpc.moderation.unsuspendUser.mutate({ userId })));
  }
  async function handleUnban() {
    await run(() => withAuthRetry(() => trpc.moderation.unbanUser.mutate({ userId })));
  }
  async function handleWarn() {
    await run(() => withAuthRetry(() => trpc.moderation.warnUser.mutate({ userId, reason, severity })));
  }
  async function handleSuspend() {
    await run(() => withAuthRetry(() => trpc.moderation.suspendUser.mutate({ userId, reason, durationDays: days })));
  }
  async function handleBan() {
    await run(() => withAuthRetry(() => trpc.moderation.banUser.mutate({ userId, reason })));
  }
  async function handleTrustAdjust() {
    await run(() => withAuthRetry(() => trpc.moderation.adjustTrustScore.mutate({ userId, delta, reason })));
  }

  if (error && !user) return <Alert severity="error">{error}</Alert>;
  if (!user) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 3, borderRadius: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: "bold" }}>{user.fullName || "Unnamed"}</Typography>
            <Typography variant="body2" color="text.secondary">{user.email}</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
              <Chip label={user.status} size="small" color={STATUS_COLOR[user.status]} />
              <Chip label={`Trust ${user.trustScore}`} size="small" variant="outlined" />
              <Chip label={`${user.warningCount} warning${user.warningCount === 1 ? "" : "s"}`} size="small" variant="outlined" />
              <Chip label={`${user.reportCount} report${user.reportCount === 1 ? "" : "s"} on posts`} size="small" variant="outlined" />
              {user.integrityViolationCount > 0 && (
                <Chip label={`${user.integrityViolationCount} upheld integrity flags`} size="small" color="error" variant="outlined" />
              )}
            </Stack>
            {user.statusReason && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                {user.status === "suspended" ? "Suspended" : "Banned"} — {user.statusReason}
                {user.suspendedUntil ? ` (until ${new Date(user.suspendedUntil).toLocaleDateString()})` : ""}
              </Typography>
            )}
          </Box>

          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            <Button size="small" variant="outlined" onClick={() => setDialog("warn")}>Warn</Button>
            {user.status !== "suspended" && (
              <Button size="small" variant="outlined" color="warning" onClick={() => setDialog("suspend")}>Suspend</Button>
            )}
            {user.status === "suspended" && (
              <Button size="small" variant="outlined" color="success" disabled={busy} onClick={handleUnsuspend}>Unsuspend</Button>
            )}
            {user.status !== "banned" && (
              <Button size="small" variant="outlined" color="error" onClick={() => setDialog("ban")}>Ban</Button>
            )}
            {user.status === "banned" && (
              <Button size="small" variant="outlined" color="success" disabled={busy} onClick={handleUnban}>Unban</Button>
            )}
            <Button size="small" variant="outlined" onClick={() => setDialog("trust")}>Adjust trust</Button>
          </Stack>
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ borderRadius: 2, overflow: "hidden" }}>
            <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
              <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>Warnings</Typography>
            </Box>
            {user.warnings.length === 0 ? (
              <Box sx={{ p: 2 }}><Typography variant="body2" color="text.secondary">None issued.</Typography></Box>
            ) : (
              <Stack divider={<Box sx={{ borderBottom: "1px solid", borderColor: "divider" }} />}>
                {user.warnings.map((w) => (
                  <Box key={w.id} sx={{ p: 2 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
                      <Chip label={w.severity} size="small" />
                      <Typography variant="caption" color="text.secondary">by {w.issuedByName || "admin"} · {new Date(w.createdAt).toLocaleDateString()}</Typography>
                    </Stack>
                    <Typography variant="body2">{w.reason}</Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ borderRadius: 2, overflow: "hidden" }}>
            <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
              <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>Moderation history</Typography>
            </Box>
            {user.actions.length === 0 ? (
              <Box sx={{ p: 2 }}><Typography variant="body2" color="text.secondary">No actions taken against this account.</Typography></Box>
            ) : (
              <Stack divider={<Box sx={{ borderBottom: "1px solid", borderColor: "divider" }} />}>
                {user.actions.map((a) => (
                  <Box key={a.id} sx={{ p: 2 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
                      <Chip label={ACTION_LABEL[a.actionType] ?? a.actionType} size="small" />
                      <Typography variant="caption" color="text.secondary">by {a.adminName || "admin"} · {new Date(a.createdAt).toLocaleDateString()}</Typography>
                    </Stack>
                    {a.reason && <Typography variant="body2">{a.reason}</Typography>}
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Dialog open={dialog === "warn"} onClose={closeDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Warn this user</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
            </TextField>
            <TextField label="Reason" multiline rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button variant="contained" disabled={busy || !reason.trim()} onClick={handleWarn}>{busy ? "Warning…" : "Warn"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialog === "suspend"} onClose={closeDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Suspend this user</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Duration (days)" type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} slotProps={{ htmlInput: { min: 1, max: 365 } }} />
            <TextField label="Reason" multiline rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button color="warning" variant="contained" disabled={busy || !reason.trim()} onClick={handleSuspend}>{busy ? "Suspending…" : "Suspend"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialog === "ban"} onClose={closeDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Ban this user</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This is indefinite — the user can appeal from Settings.
          </Typography>
          <TextField label="Reason" fullWidth multiline rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button color="error" variant="contained" disabled={busy || !reason.trim()} onClick={handleBan}>{busy ? "Banning…" : "Ban"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialog === "trust"} onClose={closeDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Adjust trust score</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Delta (e.g. -10 or 5)" type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value))} />
            <TextField label="Reason" multiline rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button variant="contained" disabled={busy || !reason.trim() || delta === 0} onClick={handleTrustAdjust}>{busy ? "Saving…" : "Apply"}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
