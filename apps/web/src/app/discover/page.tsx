"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { DiscoverResult } from "@trafy-community/core";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";

export default function DiscoverPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DiscoverResult[] | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const found = await withAuthRetry(() => trpc.discover.search.query({ query: query.trim() }));
      setResults(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function messageUser(userId: string) {
    setBusyUserId(userId);
    try {
      const { channelId } = await withAuthRetry(() => trpc.chat.getOrCreateDm.mutate({ userId }));
      router.push(`/chats?channel=${channelId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a conversation.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function toggleFollow(result: DiscoverResult) {
    setBusyUserId(result.userId);
    try {
      const status = result.following
        ? await withAuthRetry(() => trpc.follow.unfollow.mutate({ userId: result.userId }))
        : await withAuthRetry(() => trpc.follow.follow.mutate({ userId: result.userId }));
      setResults((current) =>
        current?.map((r) => (r.userId === result.userId ? { ...r, following: status.following } : r)) ?? null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update follow status.");
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <AppShell active="discover">
      <Typography variant="h4" gutterBottom>
        Discover
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Search the community by name, title, or bio.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Stack component="form" onSubmit={handleSearch} direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <TextField
            fullWidth
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. frontend developer"
          />
          <Button type="submit" variant="contained" disabled={loading || !query.trim()} sx={{ whiteSpace: "nowrap" }}>
            {loading ? "Searching…" : "Search"}
          </Button>
        </Stack>
      </Paper>

      {results === null ? (
        <Typography color="text.secondary">Search for people to follow and connect with.</Typography>
      ) : results.length === 0 ? (
        <Typography color="text.secondary">No matches for &quot;{query}&quot;.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {results.map((r) => (
            <Paper
              variant="outlined"
              key={r.userId}
              sx={{ p: 2, display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1.5, alignItems: { sm: "center" }, justifyContent: "space-between" }}
            >
              <Stack>
                <Typography sx={{ fontWeight: 600 }}>{r.fullName}</Typography>
                {r.title && (
                  <Typography variant="body2" color="text.secondary">
                    {r.title}
                  </Typography>
                )}
              </Stack>
              <Stack direction="row" spacing={1}>
                <Button variant="outlined" size="small" disabled={busyUserId === r.userId} onClick={() => messageUser(r.userId)}>
                  Message
                </Button>
                <Button
                  variant={r.following ? "outlined" : "contained"}
                  size="small"
                  disabled={busyUserId === r.userId}
                  onClick={() => toggleFollow(r)}
                >
                  {r.following ? "Following" : "Follow"}
                </Button>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </AppShell>
  );
}
