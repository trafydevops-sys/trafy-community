"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Post } from "@trafy-community/core";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ToggleButton from "@mui/material/ToggleButton";
import IconButton from "@mui/material/IconButton";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";

export default function FeedPage() {
  const [scope, setScope] = useState<"everyone" | "following">("everyone");
  const [posts, setPosts] = useState<Post[]>([]);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadFeed(currentScope: typeof scope) {
    setLoading(true);
    setError(null);
    try {
      const result = await withAuthRetry(() => trpc.posts.feed.query({ scope: currentScope }));
      setPosts(result.posts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the feed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFeed(scope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  async function handlePost(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const created = await withAuthRetry(() => trpc.posts.create.mutate({ body: draft.trim() }));
      setDraft("");
      setPosts((current) => [created, ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish your post.");
    } finally {
      setPosting(false);
    }
  }

  async function handleReact(postId: string) {
    setPosts((current) =>
      current.map((p) =>
        p.id === postId
          ? { ...p, reactedByMe: !p.reactedByMe, reactionCount: p.reactionCount + (p.reactedByMe ? -1 : 1) }
          : p
      )
    );
    try {
      await withAuthRetry(() => trpc.posts.react.mutate({ postId }));
    } catch {
      loadFeed(scope); // resync on failure
    }
  }

  return (
    <AppShell active="feed">
      <Typography variant="h4" gutterBottom>
        Home Feed
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        See what your community is building and discussing.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <Stack component="form" onSubmit={handlePost} spacing={1.5}>
            <TextField
              multiline
              minRows={3}
              placeholder="Share something with the community…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button type="submit" variant="contained" disabled={posting || !draft.trim()} sx={{ alignSelf: "flex-start" }}>
              {posting ? "Posting…" : "Post"}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <ToggleButtonGroup
        value={scope}
        exclusive
        onChange={(_, value) => value && setScope(value)}
        size="small"
        sx={{ mb: 2.5 }}
      >
        <ToggleButton value="everyone">Everyone</ToggleButton>
        <ToggleButton value="following">Following</ToggleButton>
      </ToggleButtonGroup>

      {loading ? (
        <Typography color="text.secondary">Loading the latest posts…</Typography>
      ) : posts.length === 0 ? (
        <Typography color="text.secondary">
          {scope === "following" ? "Follow people on Discover to see their posts here." : "No posts yet — share the first update with your community."}
        </Typography>
      ) : (
        <Stack spacing={2}>
          {posts.map((post) => (
            <Paper variant="outlined" sx={{ p: 2.5 }} key={post.id}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                <strong>{post.author.fullName || "Someone"}</strong> · {new Date(post.createdAt).toLocaleString()}
              </Typography>
              <Typography variant="body1" sx={{ mb: 1.5, whiteSpace: "pre-wrap" }}>
                {post.body}
              </Typography>
              <Stack direction="row" sx={{ alignItems: "center" }}>
                <IconButton size="small" color={post.reactedByMe ? "error" : "default"} onClick={() => handleReact(post.id)}>
                  {post.reactedByMe ? <FavoriteIcon fontSize="small" /> : <FavoriteBorderIcon fontSize="small" />}
                </IconButton>
                <Typography variant="body2" color="text.secondary">
                  {post.reactionCount}
                </Typography>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </AppShell>
  );
}
