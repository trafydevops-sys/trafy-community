import { useEffect, useState } from "react";
import { router } from "expo-router";
import type { Channel, SocketMessageEvent } from "@trafy-community/core";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { getSocket } from "@/lib/socket";

function sortChannels(channels: Channel[]): Channel[] {
  return [...channels].sort((a, b) => (b.lastMessage?.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? ""));
}

export default function ChatsListScreen() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const rows = await withAuthRetry(() => trpc.chat.listChannels.query());
      setChannels(sortChannels(rows));

      // Join every channel's room, not just whichever one gets opened, so
      // previews here stay live no matter which thread is currently open.
      const socket = await getSocket();
      rows.forEach((c) => socket?.emit("channel:join", c.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your chats.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    let unsubscribe: (() => void) | undefined;
    getSocket().then((socket) => {
      if (!socket) return;
      const onMessage = (event: SocketMessageEvent) => {
        setChannels((current) =>
          sortChannels(
            current.map((c) =>
              c.id === event.channelId
                ? { ...c, lastMessage: { body: event.message.body, senderId: event.message.senderId, createdAt: event.message.createdAt } }
                : c
            )
          )
        );
      };
      socket.on("message:new", onMessage);
      unsubscribe = () => socket.off("message:new", onMessage);
    });

    return () => unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <FlatList
        data={channels}
        keyExtractor={(c) => c.id}
        ListEmptyComponent={
          <Text style={styles.empty}>No chats yet — join a study group to start one, or start a DM from the web app.</Text>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/(tabs)/chats/${item.id}`)}>
            <Text style={styles.rowTitle}>{item.name || (item.type === "group" ? "Group chat" : "Direct message")}</Text>
            <Text style={styles.rowPreview} numberOfLines={1}>
              {item.lastMessage?.body ?? "No messages yet"}
            </Text>
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
  empty: { textAlign: "center", color: "#888", marginTop: 40, paddingHorizontal: 24 },
  row: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  rowTitle: { fontWeight: "600", fontSize: 15, marginBottom: 2 },
  rowPreview: { fontSize: 13, color: "#666" },
});
