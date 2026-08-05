"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Post, PostComment } from "@trafy-community/core";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ToggleButton from "@mui/material/ToggleButton";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Tooltip from "@mui/material/Tooltip";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Grid from "@mui/material/Grid";
import Container from "@mui/material/Container";
import Avatar from "@mui/material/Avatar";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import CommentIcon from "@mui/icons-material/ChatBubbleOutlined";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import ShareIcon from "@mui/icons-material/Share";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ImageIcon from "@mui/icons-material/ImageOutlined";
import LinkIcon from "@mui/icons-material/LinkOutlined";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdfOutlined";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth-context";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { uploadFile } from "@/lib/upload";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────
type PostKind = "text" | "image" | "link" | "pdf" | "achievement";

// ──────────────────────────────────────────────────────────────────────────────
// Comment Drawer
// ──────────────────────────────────────────────────────────────────────────────
function CommentDrawer({ postId, open }: { postId: string; open: boolean }) {
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    setLoading(true);
    withAuthRetry(() => trpc.posts.listComments.query({ postId }))
      .then(setComments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, postId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSubmitting(true);
    try {
      const c = await withAuthRetry(() =>
        trpc.posts.addComment.mutate({ postId, body: draft.trim(), parentId: replyingTo ?? undefined })
      );
      setComments((prev) => [c, ...prev]);
      setDraft("");
      setReplyingTo(null);
    } catch {}
    finally { setSubmitting(false); }
  }

  if (!open) return null;

  const topLevel = comments.filter((c) => !c.parentId);
  const replies = (parentId: string) => comments.filter((c) => c.parentId === parentId);

  return (
    <Box sx={{ mt: 1.5, pl: 1, borderLeft: "2px solid", borderColor: "divider" }}>
      {loading ? (
        <Box sx={{ p: 2, display: "flex", justifyContent: "center" }}><CircularProgress size={20} /></Box>
      ) : (
        <Stack spacing={1.5} sx={{ mb: 2 }}>
          {topLevel.length === 0 && (
            <Typography variant="body2" color="text.secondary">No comments yet — be the first!</Typography>
          )}
          {topLevel.map((comment) => (
            <Box key={comment.id}>
              <CommentRow comment={comment} onReply={() => setReplyingTo(comment.id)} />
              {replies(comment.id).map((r) => (
                <Box key={r.id} sx={{ pl: 3, mt: 1 }}>
                  <CommentRow comment={r} onReply={() => setReplyingTo(comment.id)} />
                </Box>
              ))}
            </Box>
          ))}
        </Stack>
      )}

      <Stack component="form" onSubmit={handleSubmit} direction="row" spacing={1} sx={{ alignItems: "flex-start", mt: 1 }}>
        <TextField
          size="small"
          multiline
          maxRows={4}
          fullWidth
          placeholder={replyingTo ? "Write a reply…" : "Write a comment…"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" variant="contained" size="small" disabled={submitting || !draft.trim()}>
          {submitting ? "…" : "Post"}
        </Button>
        {replyingTo && (
          <Button size="small" onClick={() => setReplyingTo(null)}>Cancel</Button>
        )}
      </Stack>
    </Box>
  );
}

function CommentRow({ comment, onReply }: { comment: PostComment; onReply: () => void }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        <strong>{comment.author.fullName || "Someone"}</strong> · {new Date(comment.createdAt).toLocaleString()}
      </Typography>
      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{comment.body}</Typography>
      <Button size="small" sx={{ minWidth: 0, px: 0.5, fontSize: "0.7rem" }} onClick={onReply}>Reply</Button>
    </Box>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Link Preview Card
// ──────────────────────────────────────────────────────────────────────────────
function LinkPreviewCard({ post }: { post: Post }) {
  if (!post.linkUrl) return null;
  return (
    <Box
      component="a"
      href={post.linkUrl}
      target="_blank"
      rel="noreferrer"
      sx={{
        display: "block",
        textDecoration: "none",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        overflow: "hidden",
        "&:hover": { borderColor: "primary.main" },
      }}
    >
      {post.linkImage && (
        <Box
          component="img"
          src={post.linkImage}
          alt={post.linkTitle || "link preview"}
          sx={{ width: "100%", maxHeight: 200, objectFit: "cover" }}
        />
      )}
      <Box sx={{ p: 1.5 }}>
        <Typography variant="subtitle2" noWrap>{post.linkTitle || post.linkUrl}</Typography>
        {post.linkDescription && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {post.linkDescription}
          </Typography>
        )}
        <Typography variant="caption" color="primary.main" noWrap sx={{ display: "block", mt: 0.5 }}>
          {post.linkUrl}
        </Typography>
      </Box>
    </Box>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Achievement Card Content
// ──────────────────────────────────────────────────────────────────────────────
function AchievementCard({ post }: { post: Post }) {
  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", p: 1.5, bgcolor: "warning.50", border: "1px solid", borderColor: "warning.200", borderRadius: 1 }}>
      <EmojiEventsIcon color="warning" sx={{ flexShrink: 0, mt: 0.25 }} />
      <Typography variant="body2" sx={{ fontWeight: 500 }}>{post.body}</Typography>
    </Box>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Report Dialog
// ──────────────────────────────────────────────────────────────────────────────
function ReportDialog({ postId, open, onClose }: { postId: string; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    await withAuthRetry(() => trpc.posts.report.mutate({ postId, reason: reason.trim() })).catch(() => {});
    setDone(true);
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Report this post</DialogTitle>
      <DialogContent>
        {done ? (
          <Alert severity="success" sx={{ mt: 1 }}>Thank you — our moderation team will review this.</Alert>
        ) : (
          <TextField
            autoFocus
            fullWidth
            multiline
            rows={3}
            label="Reason"
            placeholder="Describe why this post violates our guidelines…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            sx={{ mt: 1 }}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {!done && <Button variant="contained" color="error" onClick={handleSubmit} disabled={!reason.trim()}>Submit Report</Button>}
      </DialogActions>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Post Card
// ──────────────────────────────────────────────────────────────────────────────
function PostCard({ post, onUpdate }: { post: Post; onUpdate: (updated: Post) => void }) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState<null | HTMLElement>(null);

  async function handleReact() {
    onUpdate({ ...post, reactedByMe: !post.reactedByMe, reactionCount: post.reactionCount + (post.reactedByMe ? -1 : 1) });
    await withAuthRetry(() => trpc.posts.react.mutate({ postId: post.id })).catch(() => {});
  }

  async function handleSave() {
    onUpdate({ ...post, savedByMe: !post.savedByMe });
    await withAuthRetry(() => trpc.posts.save.mutate({ postId: post.id })).catch(() => {});
  }

  function handleShare() {
    const url = `${window.location.origin}/feed#post-${post.id}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setMoreAnchor(null);
  }

  const isAchievement = post.kind === "achievement";

  return (
    <Paper
      id={`post-${post.id}`}
      variant="outlined"
      sx={{
        p: 2.5,
        borderColor: isAchievement ? "warning.300" : undefined,
        background: isAchievement ? "linear-gradient(135deg, #fffbeb 0%, #fff 100%)" : undefined,
      }}
    >
      {/* Author row */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        <strong>{post.author.fullName || "Someone"}</strong> · {new Date(post.createdAt).toLocaleString()}
        {isAchievement && <Chip label="Achievement" size="small" color="warning" sx={{ ml: 1, height: 18, fontSize: "0.65rem" }} />}
      </Typography>

      {/* Content */}
      {isAchievement ? (
        <AchievementCard post={post} />
      ) : (
        <>
          {post.body && (
            <Typography variant="body1" sx={{ mb: 1.5, whiteSpace: "pre-wrap" }}>{post.body}</Typography>
          )}
          {post.kind === "image" && post.mediaUrl && (
            <Box
              component="img"
              src={post.mediaUrl}
              alt="post attachment"
              sx={{ width: "100%", maxHeight: 400, objectFit: "cover", borderRadius: 1, mb: 1.5 }}
            />
          )}
          {post.kind === "pdf" && post.mediaUrl && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1, mb: 1.5 }}>
              <PictureAsPdfIcon color="error" />
              <Typography variant="body2">
                <a href={post.mediaUrl} target="_blank" rel="noreferrer">View / Download PDF</a>
              </Typography>
            </Box>
          )}
          {post.kind === "link" && <Box sx={{ mb: 1.5 }}><LinkPreviewCard post={post} /></Box>}
        </>
      )}

      <Divider sx={{ my: 1 }} />

      {/* Actions row */}
      <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
        {/* React */}
        <Tooltip title={post.reactedByMe ? "Unlike" : "Like"}>
          <IconButton size="small" color={post.reactedByMe ? "error" : "default"} onClick={handleReact} aria-label="like">
            {post.reactedByMe ? <FavoriteIcon fontSize="small" /> : <FavoriteBorderIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>{post.reactionCount}</Typography>

        {/* Comment */}
        <Tooltip title="Comments">
          <IconButton size="small" onClick={() => setCommentsOpen((o) => !o)} aria-label="comments" color={commentsOpen ? "primary" : "default"}>
            <CommentIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>{post.commentCount}</Typography>

        {/* Save */}
        <Tooltip title={post.savedByMe ? "Unsave" : "Save"}>
          <IconButton size="small" color={post.savedByMe ? "primary" : "default"} onClick={handleSave} aria-label="save">
            {post.savedByMe ? <BookmarkIcon fontSize="small" /> : <BookmarkBorderIcon fontSize="small" />}
          </IconButton>
        </Tooltip>

        {/* Share */}
        <Tooltip title="Copy link">
          <IconButton size="small" onClick={handleShare} aria-label="share">
            <ShareIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* More (Report) */}
        <Box sx={{ ml: "auto" }}>
          <IconButton size="small" aria-label="more options" onClick={(e) => setMoreAnchor(e.currentTarget)}>
            <MoreVertIcon fontSize="small" />
          </IconButton>
          <Menu anchorEl={moreAnchor} open={Boolean(moreAnchor)} onClose={() => setMoreAnchor(null)}>
            <MenuItem onClick={() => { setMoreAnchor(null); setReportOpen(true); }}>
              Report post
            </MenuItem>
          </Menu>
        </Box>
      </Stack>

      {/* Comment drawer */}
      <CommentDrawer postId={post.id} open={commentsOpen} />
      <ReportDialog postId={post.id} open={reportOpen} onClose={() => setReportOpen(false)} />
    </Paper>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Post Composer
// ──────────────────────────────────────────────────────────────────────────────
function PostComposer({ onCreated }: { onCreated: (post: Post) => void }) {
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<PostKind>("text");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState("");
  const [ogData, setOgData] = useState<{ title?: string; image?: string; description?: string } | null>(null);
  const [scrapingOg, setScrapingOg] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Organization posting
  const [myOrgs, setMyOrgs] = useState<any[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  useEffect(() => {
    withAuthRetry(() => trpc.organizations.myOrganizations.query())
      .then(orgs => {
        const adminOrgs = orgs.filter(o => o.myRole === "admin" || o.myRole === "owner");
        setMyOrgs(adminOrgs);
      })
      .catch(() => {});
  }, []);

  const ogTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function resetAttachment() {
    setKind("text");
    setMediaUrl(null);
    setLinkInput("");
    setOgData(null);
  }

  async function handleFileUpload(file: File, uploadKind: "image" | "pdf") {
    setUploading(true);
    setError(null);
    try {
      const result = await uploadFile(uploadKind === "image" ? "avatar" : "certificate", file);
      setMediaUrl(result.url);
      setKind(uploadKind);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setKind("text");
    } finally {
      setUploading(false);
    }
  }

  function handleLinkChange(val: string) {
    setLinkInput(val);
    setOgData(null);
    if (ogTimeout.current) clearTimeout(ogTimeout.current);
    if (!val.startsWith("http")) return;
    ogTimeout.current = setTimeout(async () => {
      setScrapingOg(true);
      try {
        const data = await withAuthRetry(() => trpc.posts.scrapeOg.query({ url: val }));
        setOgData(data);
      } catch {}
      finally { setScrapingOg(false); }
    }, 800);
  }

  async function handlePost(e: FormEvent) {
    e.preventDefault();
    if (kind === "text" && !draft.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const created = await withAuthRetry(() =>
        trpc.posts.create.mutate({
          body: draft.trim(),
          kind,
          mediaUrl: mediaUrl ?? undefined,
          linkUrl: kind === "link" ? linkInput : undefined,
          linkTitle: ogData?.title,
          linkImage: ogData?.image,
          linkDescription: ogData?.description,
          organizationId: selectedOrgId || undefined,
        })
      );
      setDraft("");
      resetAttachment();
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish your post.");
    } finally {
      setPosting(false);
    }
  }

  const canPost = kind === "text" ? draft.trim().length > 0 : kind === "link" ? linkInput.length > 0 : !!mediaUrl;

  return (
    <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
      <Stack component="form" onSubmit={handlePost} spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}

        <TextField
          multiline
          minRows={3}
          placeholder="Share something with the community…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />

        {/* Link input */}
        {kind === "link" && (
          <Stack spacing={1}>
            <TextField
              size="small"
              label="URL"
              placeholder="https://example.com"
              value={linkInput}
              onChange={(e) => handleLinkChange(e.target.value)}
              slotProps={{ input: { startAdornment: <LinkIcon sx={{ mr: 1, color: "text.disabled" }} /> } }}
            />
            {scrapingOg && <Typography variant="caption" color="text.secondary">Fetching link preview…</Typography>}
            {ogData?.title && (
              <Paper variant="outlined" sx={{ p: 1.5 }}>
                {ogData.image && <Box component="img" src={ogData.image} alt="" sx={{ width: "100%", maxHeight: 150, objectFit: "cover", borderRadius: 1, mb: 1 }} />}
                <Typography variant="subtitle2">{ogData.title}</Typography>
                {ogData.description && <Typography variant="caption" color="text.secondary">{ogData.description}</Typography>}
              </Paper>
            )}
          </Stack>
        )}

        {/* Media preview */}
        {kind === "image" && mediaUrl && (
          <Box component="img" src={mediaUrl} alt="preview" sx={{ width: "100%", maxHeight: 250, objectFit: "cover", borderRadius: 1 }} />
        )}
        {kind === "pdf" && mediaUrl && (
          <Alert severity="info" icon={<PictureAsPdfIcon />}>PDF attached: <a href={mediaUrl} target="_blank" rel="noreferrer">preview</a></Alert>
        )}

        {uploading && <LinearProgress />}

        {/* Toolbar + Submit */}
        <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
          {/* Image attach */}
          <Tooltip title="Add image">
            <IconButton
              component="label"
              size="small"
              color={kind === "image" ? "primary" : "default"}
              aria-label="attach image"
              onClick={() => kind === "image" ? resetAttachment() : undefined}
            >
              <ImageIcon fontSize="small" />
              {kind !== "image" && (
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, "image"); }}
                />
              )}
            </IconButton>
          </Tooltip>

          {/* PDF attach */}
          <Tooltip title="Add PDF">
            <IconButton
              component="label"
              size="small"
              color={kind === "pdf" ? "primary" : "default"}
              aria-label="attach PDF"
              onClick={() => kind === "pdf" ? resetAttachment() : undefined}
            >
              <PictureAsPdfIcon fontSize="small" />
              {kind !== "pdf" && (
                <input
                  type="file"
                  hidden
                  accept=".pdf,application/pdf"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, "pdf"); }}
                />
              )}
            </IconButton>
          </Tooltip>

          {/* Link */}
          <Tooltip title={kind === "link" ? "Remove link" : "Add link"}>
            <IconButton
              size="small"
              color={kind === "link" ? "primary" : "default"}
              aria-label="add link"
              onClick={() => kind === "link" ? resetAttachment() : setKind("link")}
            >
              <LinkIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Box sx={{ flexGrow: 1 }} />
          {myOrgs.length > 0 && (
            <TextField
              select
              size="small"
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="">Post as myself</MenuItem>
              {myOrgs.map(org => (
                <MenuItem key={org.id} value={org.id}>Post as {org.name}</MenuItem>
              ))}
            </TextField>
          )}
          <Button type="submit" variant="contained" disabled={posting || !canPost || uploading}>
            {posting ? "Posting…" : "Post"}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Feed Page
// ──────────────────────────────────────────────────────────────────────────────
export default function FeedPage() {
  const { user } = useAuth();
  const [scope, setScope] = useState<"everyone" | "following">("everyone");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [news, setNews] = useState<any[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);

  const [stats, setStats] = useState({ profileViewsCount: 0, postImpressionsCount: 0 });

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
    
    withAuthRetry(() => (trpc as any).news.getTopStories.query())
      .then((data) => setNews(data as any[]))
      .catch(() => {})
      .finally(() => setNewsLoading(false));

    withAuthRetry(() => (trpc as any).analytics.getStats.query())
      .then((data) => setStats(data as any))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  useEffect(() => {
    if (posts.length > 0) {
      const postIds = posts.map((p) => p.id);
      withAuthRetry(() =>
        (trpc as any).analytics.recordPostImpressions.mutate({ postIds })
      ).catch(() => {});
    }
  }, [posts]);

  function handleUpdate(updated: Post) {
    setPosts((curr) => curr.map((p) => (p.id === updated.id ? updated : p)));
  }

  return (
    <AppShell active="feed">
      <Container maxWidth="lg" sx={{ pt: 3, pb: 6 }}>
        <Grid container spacing={3} sx={{ justifyContent: "center" }}>
          
          {/* Left Column: Identity */}
          <Grid size={{ xs: 12, md: 3 }} sx={{ display: { xs: "none", md: "block" } }}>
            <Paper sx={{ p: 0, overflow: "hidden", textAlign: "center", mb: 2 }}>
              <Box sx={{ height: 60, bgcolor: "rgba(10, 102, 194, 0.2)", mb: "-30px" }} />
              <Avatar sx={{ width: 64, height: 64, mx: "auto", border: "2px solid #fff", bgcolor: "primary.main", fontSize: 24, fontWeight: "bold" }}>
                {user?.email?.charAt(0).toUpperCase()}
              </Avatar>
              <Box sx={{ p: 2, pt: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: "bold", cursor: "pointer", "&:hover": { textDecoration: "underline", color: "primary.main" } }}>
                  {user?.email?.split("@")[0] || "Member"}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Software Engineer
                </Typography>
                <Divider sx={{ my: 1.5 }} />
                <Box sx={{ display: "flex", justifyContent: "space-between", cursor: "pointer", "&:hover": { bgcolor: "rgba(0,0,0,0.04)" }, p: 0.5, borderRadius: 1 }}>
                  <Typography variant="body2" color="text.secondary">Profile viewers</Typography>
                  <Typography variant="body2" color="primary" sx={{ fontWeight: "bold" }}>{stats.profileViewsCount}</Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5, cursor: "pointer", "&:hover": { bgcolor: "rgba(0,0,0,0.04)" }, p: 0.5, borderRadius: 1 }}>
                  <Typography variant="body2" color="text.secondary">Post impressions</Typography>
                  <Typography variant="body2" color="primary" sx={{ fontWeight: "bold" }}>{stats.postImpressionsCount}</Typography>
                </Box>
              </Box>
            </Paper>
          </Grid>
          
          {/* Center Column: Feed */}
          <Grid size={{ xs: 12, md: 6 }}>
            <PostComposer onCreated={(post) => setPosts((curr) => [post, ...curr])} />

            <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
              <Divider sx={{ flexGrow: 1 }} />
              <Typography variant="caption" color="text.secondary" sx={{ mx: 2 }}>
                Sort by: <strong>Top</strong>
              </Typography>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>
            ) : posts.length === 0 ? (
              <Typography color="text.secondary" sx={{ textAlign: "center", py: 4 }}>
                No posts yet — share the first update with your community.
              </Typography>
            ) : (
              <Stack spacing={2}>
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} onUpdate={handleUpdate} />
                ))}
              </Stack>
            )}
          </Grid>

          {/* Right Column: News */}
          <Grid size={{ xs: 12, md: 3 }} sx={{ display: { xs: "none", lg: "block" } }}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: "bold" }}>
                Trafy News
              </Typography>
              <Typography variant="caption" color="text.secondary" gutterBottom sx={{ display: "block" }}>
                Top stories
              </Typography>
              
              {newsLoading ? (
                <CircularProgress size={20} sx={{ mt: 2 }} />
              ) : (
                <Stack spacing={1.5} sx={{ mt: 1 }}>
                  {news.map((item: any) => (
                    <Box key={item.id}>
                      <Typography variant="body2" sx={{ fontWeight: "bold", cursor: "pointer", "&:hover": { color: "primary.main", textDecoration: "underline" }, lineHeight: 1.2, mb: 0.25 }}>
                        {item.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.timeAgo} • {item.readers} readers
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </Paper>
          </Grid>

        </Grid>
      </Container>
    </AppShell>
  );
}
