import { useEffect, useState } from "react";
import { router } from "expo-router";
import type { Notification } from "@trafy-community/core";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { getSocket } from "@/lib/socket";
import { useUnreadNotifications } from "@/lib/notifications-context";
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

export default function NotificationsScreen() {
  const { setUnreadCount } = useUnreadNotifications();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const result = await withAuthRetry(() => trpc.notifications.list.query({}));
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    let unsubscribe: (() => void) | undefined;
    getSocket().then((socket) => {
      if (!socket) return;
      const onNew = (n: Notification) => setNotifications((current) => [n, ...current]);
      socket.on("notification:new", onNew);
      unsubscribe = () => socket.off("notification:new", onNew);
    });

    return () => unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markRead(n: Notification) {
    if (n.read) return;
    setNotifications((current) => current.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setUnreadCount((c) => Math.max(0, c - 1));
    await withAuthRetry(() => trpc.notifications.markRead.mutate({ id: n.id })).catch(() => {});

    if (n.type === "chat_message" && typeof n.payload.channelId === "string") {
      router.push(`/(tabs)/chats/${n.payload.channelId}`);
    }
  }

  async function markAllRead() {
    setNotifications((current) => current.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    await withAuthRetry(() => trpc.notifications.markAllRead.mutate()).catch(() => {});
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {error && <Text style={styles.error}>{error}</Text>}
      {notifications.some((n) => !n.read) && (
        <Pressable style={styles.markAllButton} onPress={markAllRead}>
          <Text style={styles.markAllText}>Mark all as read</Text>
        </Pressable>
      )}
      <FlatList
        data={notifications}
        keyExtractor={(n) => n.id}
        ListEmptyComponent={<Text style={styles.empty}>Nothing yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={[styles.row, !item.read && styles.rowUnread]} onPress={() => markRead(item)}>
            <Text style={styles.rowText}>{describe(item)}</Text>
            <Text style={styles.rowDate}>{new Date(item.createdAt).toLocaleString()}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: "#b00020", backgroundColor: "#fdecea", padding: 8, fontSize: 12, textAlign: "center" },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  markAllButton: { padding: 12, alignItems: "flex-end" },
  markAllText: { color: "#111", fontWeight: "600", fontSize: 13 },
  row: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  rowUnread: { backgroundColor: "#f7f7ff" },
  rowText: { fontSize: 14, color: "#222", marginBottom: 4 },
  rowDate: { fontSize: 11, color: "#999" },
});
