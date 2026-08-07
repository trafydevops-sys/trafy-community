"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DashboardStats } from "@trafy-community/core";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";

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

function StatCard({ label, value, href, color }: { label: string; value: number; href: string; color?: string }) {
  return (
    <Grid size={{ xs: 6, md: 4 }}>
      <Paper component={Link} href={href} sx={{ p: 3, display: "block", textDecoration: "none", color: "inherit", borderRadius: 2 }}>
        <Typography variant="h3" sx={{ fontWeight: "bold", color: color || "text.primary" }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Paper>
    </Grid>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    withAuthRetry(() => trpc.moderation.getDashboardStats.query())
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load dashboard stats."));
  }, []);

  if (error) return <Typography color="error">{error}</Typography>;
  if (!stats) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={4}>
      <Grid container spacing={2}>
        <StatCard label="Pending reports" value={stats.pendingReports} href="/admin/reports" color={stats.pendingReports > 0 ? "error.main" : undefined} />
        <StatCard label="Pending appeals" value={stats.pendingAppeals} href="/admin/appeals" color={stats.pendingAppeals > 0 ? "warning.main" : undefined} />
        <StatCard label="Unresolved integrity flags" value={stats.unresolvedIntegrityFlags} href="/admin/reports" />
        <StatCard label="Suspended users" value={stats.suspendedUsers} href="/admin/users" />
        <StatCard label="Banned users" value={stats.bannedUsers} href="/admin/users" />
        <StatCard label="Recent actions" value={stats.recentActions.length} href="/admin/audit-log" />
      </Grid>

      <Paper sx={{ p: 0, borderRadius: 2, overflow: "hidden" }}>
        <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="h6" sx={{ fontWeight: "bold" }}>
            Recent moderation activity
          </Typography>
        </Box>
        {stats.recentActions.length === 0 ? (
          <Box sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary">
              Nothing yet.
            </Typography>
          </Box>
        ) : (
          <Stack divider={<Box sx={{ borderBottom: "1px solid", borderColor: "divider" }} />}>
            {stats.recentActions.map((a) => (
              <Box key={a.id} sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Chip label={ACTION_LABEL[a.actionType] ?? a.actionType} size="small" />
                    <Typography variant="body2">by {a.adminName || "admin"}</Typography>
                  </Stack>
                  {a.reason && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                      {a.reason}
                    </Typography>
                  )}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                  {new Date(a.createdAt).toLocaleString()}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}
