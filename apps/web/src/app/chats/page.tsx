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
  const listRef = useRef<HTMLDivElement>(null);

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
      .then((r) => setMessages(r.messages))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load messages."));
  }, [activeId]);

  useEffect(() => {
    const socket = getSocket();
    function onMessage(event: SocketMessageEvent) {
      if (event.channelId === activeId) {
        setMessages((current) => [...current, event.message]);
      }
      setChannels((current) =>
        current.map((c) =>
          c.id === event.channelId
            ? { ...c, lastMessage: { body: event.message.body, senderId: event.message.senderId, createdAt: event.message.createdAt } }
            : c
        )
      );
    }
    socket?.on("message:new", onMessage);
    return () => {
      socket?.off("message:new", onMessage);
    };
  }, [activeId]);

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
      // No local append here — the server broadcasts to this channel's room,
      // and we're joined to it, so our own message arrives back over the socket.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message.");
      setDraft(body);
    }
  }

  const activeChannel = channels.find((c) => c.id === activeId);

  return (
    <AppShell active="chats">
      <Typography variant="h4" gutterBottom>
        Chats
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Direct messages and study groups.
      </Typography>
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
                        bgcolor: mine ? "primary.main" : "grey.100",
                        color: mine ? "primary.contrastText" : "text.primary",
                      }}
                    >
                      <Typography variant="body2">{m.body}</Typography>
                    </Paper>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                      {mine ? "You" : m.senderName} · {new Date(m.createdAt).toLocaleTimeString()}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
            <Stack component="form" onSubmit={handleSend} direction="row" spacing={1} sx={{ p: 1.5, borderTop: 1, borderColor: "divider" }}>
              <TextField
                fullWidth
                size="small"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={activeChannel ? `Message ${activeChannel.name ?? ""}` : "Select a conversation"}
                disabled={!activeId}
              />
              <Button type="submit" variant="contained" disabled={!activeId || !draft.trim()}>
                Send
              </Button>
            </Stack>
          </Box>
        </Paper>
      )}
    </AppShell>
  );
}
