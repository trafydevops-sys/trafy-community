"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TRPCClientError } from "@trpc/client";
import type { ReportStatus, ReportSummary } from "@trafy-community/core";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ToggleButton from "@mui/material/ToggleButton";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof TRPCClientError ? err.message : fallback;
}

const STATUS_COLOR: Record<ReportStatus, "warning" | "default" | "success"> = {
  pending: "warning",
  dismissed: "default",
  actioned: "success",
};

export default function AdminReportsPage() {
  const [status, setStatus] = useState<ReportStatus | "all">("pending");
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hideDialog, setHideDialog] = useState<ReportSummary | null>(null);
  const [note, setNote] = useState("");

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const result = await withAuthRetry(() =>
        trpc.moderation.listReports.query({ status: status === "all" ? undefined : status, cursor: reset ? undefined : nextCursor })
      );
      setReports((prev) => (reset ? result.reports : [...prev, ...result.reports]));
      setNextCursor(result.nextCursor);
    } catch (err) {
      setError(errorMessage(err, "Could not load reports."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function handleDismiss(report: ReportSummary) {
    setBusyId(report.id);
    setError(null);
    try {
      await withAuthRetry(() => trpc.moderation.resolveReport.mutate({ reportId: report.id, action: "dismiss" }));
      await load(true);
    } catch (err) {
      setError(errorMessage(err, "Could not dismiss the report."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleHidePost() {
    if (!hideDialog) return;
    setBusyId(hideDialog.id);
    setError(null);
    try {
      await withAuthRetry(() => trpc.moderation.resolveReport.mutate({ reportId: hideDialog.id, action: "hide_post", note: note || undefined }));
      setHideDialog(null);
      setNote("");
      await load(true);
    } catch (err) {
      setError(errorMessage(err, "Could not hide the post."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: "bold" }}>
          Reports
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Content flagged by users, queued for review.
        </Typography>
      </Box>

      <ToggleButtonGroup
        value={status}
        exclusive
        size="small"
        onChange={(_e, v) => { if (v) setStatus(v); }}
      >
        <ToggleButton value="pending">Pending</ToggleButton>
        <ToggleButton value="actioned">Actioned</ToggleButton>
        <ToggleButton value="dismissed">Dismissed</ToggleButton>
        <ToggleButton value="all">All</ToggleButton>
      </ToggleButtonGroup>

      {error && <Alert severity="error">{error}</Alert>}

      {loading && reports.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : reports.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No reports here.
        </Typography>
      ) : (
        <Stack spacing={2}>
          {reports.map((r) => (
            <Paper key={r.id} sx={{ p: 2.5, borderRadius: 2 }}>
              <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5, flexWrap: "wrap" }}>
                    <Chip label={r.status} size="small" color={STATUS_COLOR[r.status]} />
                    {r.reportCount > 1 && <Chip label={`${r.reportCount} reports on this post`} size="small" variant="outlined" />}
                    {r.postHiddenAt && <Chip label="Post hidden" size="small" color="success" variant="outlined" />}
                  </Stack>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    <strong>{r.postAuthor.fullName || "Unknown"}</strong>: {r.postBody.slice(0, 160)}
                    {r.postBody.length > 160 ? "…" : ""}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Reported by {r.reporter.fullName || "someone"} — &ldquo;{r.reason}&rdquo; — {new Date(r.createdAt).toLocaleString()}
                  </Typography>
                </Box>
                {r.status === "pending" && (
                  <Stack spacing={1} sx={{ flexShrink: 0 }}>
                    <Button size="small" variant="outlined" color="error" disabled={busyId === r.id} onClick={() => setHideDialog(r)}>
                      Hide post
                    </Button>
                    <Button size="small" variant="text" disabled={busyId === r.id} onClick={() => handleDismiss(r)}>
                      Dismiss
                    </Button>
                    <Button size="small" variant="text" component={Link} href={`/admin/users/${r.postAuthor.id}`}>
                      View author
                    </Button>
                  </Stack>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      {nextCursor && !loading && (
        <Button variant="outlined" onClick={() => load(false)}>
          Load more
        </Button>
      )}

      <Dialog open={Boolean(hideDialog)} onClose={() => setHideDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Hide this post?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The post is removed from feeds immediately. All pending reports against it are closed out too.
          </Typography>
          <TextField label="Reason (optional, shown in the audit log)" fullWidth multiline rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHideDialog(null)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={busyId === hideDialog?.id} onClick={handleHidePost}>
            {busyId === hideDialog?.id ? "Hiding…" : "Hide post"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
