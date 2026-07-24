"use client";

import { useEffect, useState } from "react";
import type { Notification } from "@trafy-community/core";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { getSocket } from "@/lib/socket";
import { formatMoney } from "@/lib/format";

function describe(n: Notification): string {
  const actorName = typeof n.payload.actorName === "string" ? n.payload.actorName : "Someone";
  const str = (key: string) => (typeof n.payload[key] === "string" ? (n.payload[key] as string) : "");
  const num = (key: string) => (typeof n.payload[key] === "number" ? (n.payload[key] as number) : 0);

  switch (n.type) {
    case "new_follower":
      return `${actorName} started following you.`;
    case "post_reaction":
      return `${actorName} liked your post.`;
    case "chat_message":
      return `${actorName} sent you a message.`;
    case "course_sale":
      return `${actorName} bought "${str("courseTitle")}" for ${formatMoney(num("amountCents"), "usd")}.`;
    case "job_application":
      return `${actorName} applied to "${str("jobTitle")}".`;
    case "application_status_changed":
      return `Your application to "${str("jobTitle")}" moved to ${str("status")}.`;
    case "contract_created":
      return `${actorName} created a contract for "${str("jobTitle")}".`;
    case "milestone_funded":
      return `${actorName} funded the "${str("milestoneTitle")}" milestone (${formatMoney(num("amountCents"), "usd")}).`;
    case "milestone_released":
      return `${actorName} released the "${str("milestoneTitle")}" milestone (${formatMoney(num("amountCents"), "usd")}) to you.`;
    case "org_invite":
      return `${actorName} added you to ${str("organizationName")} as ${str("role")}.`;
    default:
      return "New notification.";
  }
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const result = await withAuthRetry(() => trpc.notifications.list.query({}));
      setNotifications(result.notifications);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const socket = getSocket();
    const onNew = (n: Notification) => setNotifications((current) => [n, ...current]);
    socket?.on("notification:new", onNew);
    return () => {
      socket?.off("notification:new", onNew);
    };
  }, []);

  async function markRead(id: string) {
    setNotifications((current) => current.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await withAuthRetry(() => trpc.notifications.markRead.mutate({ id })).catch(() => {});
  }

  async function markAllRead() {
    setNotifications((current) => current.map((n) => ({ ...n, read: true })));
    await withAuthRetry(() => trpc.notifications.markAllRead.mutate()).catch(() => {});
  }

  return (
    <AppShell active="notifications">
      <Typography variant="h4" gutterBottom>
        Notifications
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Followers, likes, and messages.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {notifications.some((n) => !n.read) && (
        <Button variant="outlined" size="small" onClick={markAllRead} sx={{ mb: 2 }}>
          Mark all as read
        </Button>
      )}

      {loading ? (
        <Typography color="text.secondary">Loading notifications…</Typography>
      ) : notifications.length === 0 ? (
        <Typography color="text.secondary">Nothing yet.</Typography>
      ) : (
        <Stack spacing={1}>
          {notifications.map((n) => (
            <Paper
              key={n.id}
              variant="outlined"
              sx={{
                p: 2,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 1.5,
                borderLeft: n.read ? undefined : 3,
                borderLeftColor: n.read ? undefined : "primary.main",
                bgcolor: n.read ? undefined : "grey.50",
              }}
            >
              <Box>
                <Typography variant="body2">{describe(n)}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(n.createdAt).toLocaleString()}
                </Typography>
              </Box>
              {!n.read && (
                <Button size="small" onClick={() => markRead(n.id)}>
                  Mark read
                </Button>
              )}
            </Paper>
          ))}
        </Stack>
      )}
    </AppShell>
  );
}
