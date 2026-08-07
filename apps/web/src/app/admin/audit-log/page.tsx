"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TRPCClientError } from "@trpc/client";
import type { ModerationAction } from "@trafy-community/core";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof TRPCClientError ? err.message : fallback;
}

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

export default function AdminAuditLogPage() {
  const [actions, setActions] = useState<ModerationAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const result = await withAuthRetry(() => trpc.moderation.listAuditLog.query({ cursor: reset ? undefined : nextCursor }));
      setActions((prev) => (reset ? result.actions : [...prev, ...result.actions]));
      setNextCursor(result.nextCursor);
    } catch (err) {
      setError(errorMessage(err, "Could not load the audit log."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: "bold" }}>Audit log</Typography>
        <Typography variant="body2" color="text.secondary">Every moderation action, in order.</Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {loading && actions.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper sx={{ borderRadius: 2, overflow: "hidden" }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Action</TableCell>
                  <TableCell>Admin</TableCell>
                  <TableCell>Target</TableCell>
                  <TableCell>Reason</TableCell>
                  <TableCell>When</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {actions.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell><Chip label={ACTION_LABEL[a.actionType] ?? a.actionType} size="small" /></TableCell>
                    <TableCell>{a.adminName || "—"}</TableCell>
                    <TableCell>
                      {a.targetUserId ? (
                        <Button component={Link} href={`/admin/users/${a.targetUserId}`} size="small">User</Button>
                      ) : a.targetPostId ? (
                        <Typography variant="caption" color="text.secondary">Post</Typography>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ maxWidth: 320 }}>{a.reason || "—"}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                        {new Date(a.createdAt).toLocaleString()}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
                {actions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                        Nothing logged yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {nextCursor && !loading && (
        <Button variant="outlined" onClick={() => load(false)}>Load more</Button>
      )}
    </Stack>
  );
}
