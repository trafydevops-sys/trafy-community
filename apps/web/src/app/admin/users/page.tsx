"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { TRPCClientError } from "@trpc/client";
import type { ModUserSummary, UserStatus } from "@trafy-community/core";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ToggleButton from "@mui/material/ToggleButton";
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

const STATUS_COLOR: Record<UserStatus, "success" | "warning" | "error"> = {
  active: "success",
  suspended: "warning",
  banned: "error",
};

export default function AdminUsersPage() {
  const [status, setStatus] = useState<UserStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<ModUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const result = await withAuthRetry(() =>
        trpc.moderation.listUsers.query({
          status: status === "all" ? undefined : status,
          query: query.trim() || undefined,
          cursor: reset ? undefined : nextCursor,
        })
      );
      setUsers((prev) => (reset ? result.users : [...prev, ...result.users]));
      setNextCursor(result.nextCursor);
    } catch (err) {
      setError(errorMessage(err, "Could not load users."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    load(true);
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: "bold" }}>
          Users
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Search, review standing, and take action.
        </Typography>
      </Box>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Box component="form" onSubmit={handleSearch} sx={{ display: "flex", gap: 1, flex: 1 }}>
          <TextField size="small" placeholder="Search by name or email" fullWidth value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button type="submit" variant="outlined">
            Search
          </Button>
        </Box>
        <ToggleButtonGroup value={status} exclusive size="small" onChange={(_e, v) => { if (v) setStatus(v); }}>
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="active">Active</ToggleButton>
          <ToggleButton value="suspended">Suspended</ToggleButton>
          <ToggleButton value="banned">Banned</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {loading && users.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper sx={{ borderRadius: 2, overflow: "hidden" }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Trust</TableCell>
                  <TableCell align="right">Warnings</TableCell>
                  <TableCell align="right">Reports</TableCell>
                  <TableCell>Joined</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} hover component={Link} href={`/admin/users/${u.id}`} sx={{ textDecoration: "none", cursor: "pointer" }}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{u.fullName || "—"}</Typography>
                      <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={u.status} size="small" color={STATUS_COLOR[u.status]} />
                    </TableCell>
                    <TableCell align="right">{u.trustScore}</TableCell>
                    <TableCell align="right">{u.warningCount}</TableCell>
                    <TableCell align="right">{u.reportCount}</TableCell>
                    <TableCell>{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                        No users match.
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
        <Button variant="outlined" onClick={() => load(false)}>
          Load more
        </Button>
      )}
    </Stack>
  );
}
