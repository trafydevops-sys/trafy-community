"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TRPCClientError } from "@trpc/client";
import type { Appeal, AppealStatus } from "@trafy-community/core";
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

const STATUS_COLOR: Record<AppealStatus, "warning" | "success" | "error"> = {
  pending: "warning",
  approved: "success",
  rejected: "error",
};

export default function AdminAppealsPage() {
  const [status, setStatus] = useState<AppealStatus | "all">("pending");
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [reviewing, setReviewing] = useState<{ appeal: Appeal; decision: "approve" | "reject" } | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const result = await withAuthRetry(() =>
        trpc.moderation.listAppeals.query({ status: status === "all" ? undefined : status, cursor: reset ? undefined : nextCursor })
      );
      setAppeals((prev) => (reset ? result.appeals : [...prev, ...result.appeals]));
      setNextCursor(result.nextCursor);
    } catch (err) {
      setError(errorMessage(err, "Could not load appeals."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function handleResolve() {
    if (!reviewing) return;
    setBusy(true);
    setError(null);
    try {
      await withAuthRetry(() =>
        trpc.moderation.resolveAppeal.mutate({ appealId: reviewing.appeal.id, decision: reviewing.decision, notes: notes || undefined })
      );
      setReviewing(null);
      setNotes("");
      await load(true);
    } catch (err) {
      setError(errorMessage(err, "Could not resolve the appeal."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: "bold" }}>Appeals</Typography>
        <Typography variant="body2" color="text.secondary">Requests to lift a suspension or ban.</Typography>
      </Box>

      <ToggleButtonGroup value={status} exclusive size="small" onChange={(_e, v) => { if (v) setStatus(v); }}>
        <ToggleButton value="pending">Pending</ToggleButton>
        <ToggleButton value="approved">Approved</ToggleButton>
        <ToggleButton value="rejected">Rejected</ToggleButton>
        <ToggleButton value="all">All</ToggleButton>
      </ToggleButtonGroup>

      {error && <Alert severity="error">{error}</Alert>}

      {loading && appeals.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : appeals.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No appeals here.</Typography>
      ) : (
        <Stack spacing={2}>
          {appeals.map((a) => (
            <Paper key={a.id} sx={{ p: 2.5, borderRadius: 2 }}>
              <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
                    <Chip label={a.status} size="small" color={STATUS_COLOR[a.status]} />
                    <Chip label={a.userStatus} size="small" variant="outlined" />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.userFullName || a.userEmail}</Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>{a.reason}</Typography>
                  <Typography variant="caption" color="text.secondary">{new Date(a.createdAt).toLocaleString()}</Typography>
                  {a.reviewerNotes && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                      Reviewer notes: {a.reviewerNotes}
                    </Typography>
                  )}
                </Box>
                <Stack spacing={1} sx={{ flexShrink: 0 }}>
                  {a.status === "pending" && (
                    <>
                      <Button size="small" variant="outlined" color="success" onClick={() => setReviewing({ appeal: a, decision: "approve" })}>
                        Approve
                      </Button>
                      <Button size="small" variant="outlined" color="error" onClick={() => setReviewing({ appeal: a, decision: "reject" })}>
                        Reject
                      </Button>
                    </>
                  )}
                  <Button size="small" variant="text" component={Link} href={`/admin/users/${a.userId}`}>
                    View user
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      {nextCursor && !loading && (
        <Button variant="outlined" onClick={() => load(false)}>Load more</Button>
      )}

      <Dialog open={Boolean(reviewing)} onClose={() => setReviewing(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{reviewing?.decision === "approve" ? "Approve appeal" : "Reject appeal"}</DialogTitle>
        <DialogContent>
          {reviewing?.decision === "approve" && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              This immediately restores the account to active.
            </Typography>
          )}
          <TextField label="Notes (optional)" fullWidth multiline rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewing(null)}>Cancel</Button>
          <Button
            variant="contained"
            color={reviewing?.decision === "approve" ? "success" : "error"}
            disabled={busy}
            onClick={handleResolve}
          >
            {busy ? "Saving…" : reviewing?.decision === "approve" ? "Approve" : "Reject"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
