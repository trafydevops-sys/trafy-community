"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { StudyGroup } from "@trafy-community/core";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { useAuth } from "@/lib/auth-context";

export default function GroupsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  async function load(q?: string) {
    setLoading(true);
    setError(null);
    try {
      const found = await withAuthRetry(() => trpc.groups.list.query({ query: q }));
      setGroups(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load study groups.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    load(query.trim() || undefined);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const group = await withAuthRetry(() =>
        trpc.groups.create.mutate({ name, topic: topic || undefined, description: description || undefined })
      );
      setName("");
      setTopic("");
      setDescription("");
      router.push(`/chats?channel=${group.channelId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the group.");
    } finally {
      setCreating(false);
    }
  }

  async function toggleMembership(group: StudyGroup) {
    setBusyId(group.id);
    setError(null);
    try {
      const updated = group.isMember
        ? await withAuthRetry(() => trpc.groups.leave.mutate({ groupId: group.id }))
        : await withAuthRetry(() => trpc.groups.join.mutate({ groupId: group.id }));
      setGroups((current) => current.map((g) => (g.id === group.id ? updated : g)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update membership.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell active="groups">
      <Typography variant="h4" gutterBottom>
        Study Groups
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Join a group to learn together — each group has its own chat.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Start a study group
        </Typography>
        <Stack component="form" onSubmit={handleCreate} spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField label="Name" fullWidth required value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label="Topic" fullWidth placeholder="e.g. React" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </Stack>
          <TextField label="Description" multiline rows={2} fullWidth value={description} onChange={(e) => setDescription(e.target.value)} />
          <Button type="submit" variant="contained" disabled={creating || !name.trim()} sx={{ alignSelf: "flex-start" }}>
            {creating ? "Creating…" : "Create group"}
          </Button>
        </Stack>
      </Paper>

      <Stack component="form" onSubmit={handleSearch} direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 3 }}>
        <TextField fullWidth value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search groups by name or topic…" />
        <Button type="submit" variant="contained" sx={{ whiteSpace: "nowrap" }}>
          Search
        </Button>
      </Stack>

      {loading ? (
        <Typography color="text.secondary">Loading study groups…</Typography>
      ) : groups.length === 0 ? (
        <Typography color="text.secondary">No study groups yet — create the first one above.</Typography>
      ) : (
        <Stack spacing={2}>
          {groups.map((g) => (
            <Paper variant="outlined" sx={{ p: 2.5 }} key={g.id}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between" }}>
                <Box>
                  {g.topic && <Chip size="small" label={g.topic} sx={{ mb: 0.5 }} />}
                  <Typography variant="h6" sx={{ mt: 0.5 }}>
                    {g.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    by {g.ownerName} · {g.memberCount} member{g.memberCount === 1 ? "" : "s"}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                  {g.isMember && (
                    <Button variant="outlined" size="small" onClick={() => router.push(`/chats?channel=${g.channelId}`)}>
                      Open chat
                    </Button>
                  )}
                  {g.ownerId === user?.id ? (
                    <Chip size="small" label="Owner" color="primary" variant="outlined" />
                  ) : (
                    <Button
                      variant={g.isMember ? "outlined" : "contained"}
                      size="small"
                      disabled={busyId === g.id}
                      onClick={() => toggleMembership(g)}
                    >
                      {g.isMember ? "Leave" : "Join"}
                    </Button>
                  )}
                </Stack>
              </Stack>
              {g.description && (
                <Typography variant="body2" sx={{ mt: 1.5 }}>
                  {g.description}
                </Typography>
              )}
            </Paper>
          ))}
        </Stack>
      )}
    </AppShell>
  );
}
