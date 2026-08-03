"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import type { Channel, Message, SocketMessageEvent } from "@trafy-community/core";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import IconButton from "@mui/material/IconButton";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { getSocket } from "@/lib/socket";
import { useAuth } from "@/lib/auth-context";

export default function ChatsPage() {
  return (
    <Suspense fallback={null}>
      <ChatsPageInner />
    </Suspense>
  );
}

function ChatsPageInner() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const preselectChannel = searchParams.get("channel");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(preselectChannel);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [readState, setReadState] = useState<Record<string, string>>({}); // channelId -> messageId

  // InMail Dialog
  const [inmailOpen, setInmailOpen] = useState(false);
  const [inmailAddressee, setInmailAddressee] = useState("");
  const [inmailSubject, setInmailSubject] = useState("");
  const [inmailBody, setInmailBody] = useState("");

  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<any>(null);
  const [inmailSending, setInmailSending] = useState(false);

  useEffect(() => {
    withAuthRetry(() => trpc.profile.get.query())
      .then(p => setProfile(p))
      .catch(console.error);
  }, []);

  const markRead = async (channelId: string, upToMessageId: string) => {
    try {
      await withAuthRetry(() => trpc.chat.markRead.mutate({ channelId, upToMessageId }));
    } catch (e) {
      console.error("Failed to mark as read", e);
    }
  };


  const sendInmail = async () => {
    setInmailSending(true);
    try {
      await withAuthRetry(() => trpc.chat.sendInmail.mutate({ 
        addresseeId: inmailAddressee, 
        subject: inmailSubject, 
        body: inmailBody 
      }));
      setInmailOpen(false);
      setInmailAddressee("");
      setInmailSubject("");
      setInmailBody("");
      refreshChannels();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Failed to send InMail");
    } finally {
      setInmailSending(false);
    }
  };

  async function refreshChannels() {
    const list = await withAuthRetry(() => trpc.chat.listChannels.query());
    setChannels(list);
    const socket = getSocket();
    list.forEach((c) => socket?.emit("channel:join", c.id));
    if (!activeId && list.length > 0) setActiveId(list[0]?.id ?? null);
  }

  useEffect(() => {
    refreshChannels().catch((err) => setError(err instanceof Error ? err.message : "Could not load chats."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeId) return;
    withAuthRetry(() => trpc.chat.listMessages.query({ channelId: activeId }))
      .then((r) => {
        setMessages(r.messages);
        if (r.messages.length > 0) {
          const lastMsg = r.messages[r.messages.length - 1];
          if (lastMsg) markRead(activeId, lastMsg.id);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load messages."));
  }, [activeId]);

  useEffect(() => {
    const socket = getSocket();
    function onMessage(event: SocketMessageEvent) {
      if (event.channelId === activeId) {
        setMessages((current) => [...current, event.message]);
        markRead(activeId, event.message.id);
      }
      setChannels((current) =>
        current.map((c) =>
          c.id === event.channelId
            ? { ...c, lastMessage: { body: event.message.body, senderId: event.message.senderId, createdAt: event.message.createdAt } }
            : c
        )
      );
    }
    function onMessageRead(payload: { channelId: string; userId: string; readUpToId: string }) {
      if (payload.userId !== user?.id) {
        setReadState(prev => ({ ...prev, [payload.channelId]: payload.readUpToId }));
      }
    }
    socket?.on("message:new", onMessage);
    socket?.on("message:read", onMessageRead);
    return () => {
      socket?.off("message:new", onMessage);
      socket?.off("message:read", onMessageRead);
    };
  }, [activeId, user?.id]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !activeId) return;
    const body = draft.trim();
    setDraft("");
    try {
      await withAuthRetry(() => trpc.chat.sendMessage.mutate({ channelId: activeId, body }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message.");
      setDraft(body);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeId) return;
    
    setUploading(true);
    try {
      // mock upload for now since upload endpoint is not exposed
      const mediaUrl = `https://dummyimage.com/600x400/000/fff&text=${encodeURIComponent(file.name)}`;
      const mediaKind = file.type.startsWith("image/") ? "image" : (file.type === "application/pdf" ? "pdf" : "file");

      await withAuthRetry(() => trpc.chat.sendMessage.mutate({ 
        channelId: activeId, 
        body: `Sent an attachment`, 
        mediaUrl, 
        mediaKind 
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }


  const activeChannel = channels.find((c) => c.id === activeId);

  return (
    <AppShell active="chats">
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Chats
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Direct messages and study groups.
          </Typography>
        </Box>
        {profile?.userRole === "recruiter" && (
          <Button variant="contained" onClick={() => setInmailOpen(true)}>
            New InMail
          </Button>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {channels.length === 0 ? (
        <Typography color="text.secondary">
          No conversations yet — follow someone on Discover, then start a chat from their profile.
        </Typography>
      ) : (
        <Paper variant="outlined" sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, height: { md: 520 }, overflow: "hidden" }}>
          <Box
            sx={{
              width: { xs: "100%", md: 260 },
              borderRight: { md: 1 },
              borderBottom: { xs: 1, md: 0 },
              borderColor: "divider",
              overflowY: "auto",
              maxHeight: { xs: 220, md: "none" },
            }}
          >
            <List disablePadding>
              {channels.map((c) => (
                <ListItemButton key={c.id} selected={c.id === activeId} onClick={() => setActiveId(c.id)}>
                  <ListItemText
                    primary={c.name || "Untitled"}
                    secondary={c.lastMessage?.body.slice(0, 40)}
                    slotProps={{ secondary: { noWrap: true } }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Box>

          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <Box ref={listRef} sx={{ flex: 1, overflowY: "auto", p: 2, display: "flex", flexDirection: "column", gap: 1 }}>
              {messages.map((m) => {
                const mine = m.senderId === user?.id;
                return (
                  <Box key={m.id} sx={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                    <Paper
                      sx={{
                        px: 1.5,
                        py: 1,
                        maxWidth: "75%",
                        bgcolor: mine ? "primary.main" : (m.isInmail ? "secondary.light" : "grey.100"),
                        color: mine ? "primary.contrastText" : (m.isInmail ? "secondary.contrastText" : "text.primary"),
                        border: m.isInmail && !mine ? "1px solid" : "none",
                        borderColor: "secondary.main",
                      }}
                    >
                      {m.isInmail && <Typography variant="caption" sx={{ fontWeight: "bold", display: "block", mb: 0.5 }}>INMAIL</Typography>}
                      {m.mediaUrl && m.mediaKind === "image" && (
                        <Box component="img" src={m.mediaUrl} sx={{ maxWidth: "100%", borderRadius: 1, mb: 1, display: "block" }} />
                      )}
                      {m.mediaUrl && m.mediaKind !== "image" && (
                        <Button variant="contained" color="inherit" size="small" href={m.mediaUrl} target="_blank" sx={{ mb: 1, color: "black" }}>
                          View Attachment
                        </Button>
                      )}
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{m.body}</Typography>
                    </Paper>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        {mine ? "You" : m.senderName} · {new Date(m.createdAt).toLocaleTimeString()}
                      </Typography>
                      {mine && readState[m.channelId] === m.id && (
                        <Typography variant="caption" color="primary" sx={{ fontWeight: "bold" }}>
                          Seen
                        </Typography>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
            <Stack component="form" onSubmit={handleSend} direction="row" spacing={1} sx={{ p: 1.5, borderTop: 1, borderColor: "divider", alignItems: "center" }}>
              <input type="file" ref={fileInputRef} style={{ display: "none" }} onChange={handleFileUpload} />
              <IconButton disabled={!activeId || uploading} onClick={() => fileInputRef.current?.click()} color="primary">
                <AttachFileIcon />
              </IconButton>
              <TextField
                fullWidth
                size="small"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={activeChannel ? `Message ${activeChannel.name ?? ""}` : "Select a conversation"}
                disabled={!activeId || uploading}
              />
              <Button type="submit" variant="contained" disabled={!activeId || !draft.trim() || uploading}>
                Send
              </Button>
            </Stack>
          </Box>
        </Paper>
      )}

      {/* Recruiter InMail Dialog */}
      <Dialog open={inmailOpen} onClose={() => setInmailOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Send InMail</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="User ID (Addressee)"
            fullWidth
            variant="outlined"
            value={inmailAddressee}
            onChange={(e) => setInmailAddressee(e.target.value)}
          />
          <TextField
            margin="dense"
            label="Subject"
            fullWidth
            variant="outlined"
            value={inmailSubject}
            onChange={(e) => setInmailSubject(e.target.value)}
          />
          <TextField
            margin="dense"
            label="Message Body"
            fullWidth
            multiline
            rows={4}
            variant="outlined"
            value={inmailBody}
            onChange={(e) => setInmailBody(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInmailOpen(false)}>Cancel</Button>
          <Button 
            onClick={sendInmail} 
            variant="contained" 
            disabled={!inmailAddressee || !inmailSubject || !inmailBody || inmailSending}
          >
            Send InMail
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
