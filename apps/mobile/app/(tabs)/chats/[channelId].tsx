import { useEffect, useRef, useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import type { Message, SocketMessageEvent } from "@trafy-community/core";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { getSocket } from "@/lib/socket";
import { useAuth } from "@/lib/auth-context";

export default function ChatThreadScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const { user } = useAuth();
  const listRef = useRef<FlatList<Message>>(null);

  const [title, setTitle] = useState("Chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      setError(null);
      try {
        const [channels, page] = await Promise.all([
          withAuthRetry(() => trpc.chat.listChannels.query()),
          withAuthRetry(() => trpc.chat.listMessages.query({ channelId })),
        ]);
        const channel = channels.find((c) => c.id === channelId);
        setTitle(channel?.name || (channel?.type === "group" ? "Group chat" : "Direct message"));
        setMessages(page.messages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load this conversation.");
      } finally {
        setLoading(false);
      }

      // Deep-linking straight into a thread (e.g. from a push notification
      // tap) may not have gone through the channel list's join-all-channels
      // step — join here too, defensively (idempotent on the server).
      const socket = await getSocket();
      socket?.emit("channel:join", channelId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    getSocket().then((socket) => {
      if (!socket) return;
      const onMessage = (event: SocketMessageEvent) => {
        if (event.channelId !== channelId) return;
        setMessages((current) => {
          if (current.some((m) => m.id === event.message.id)) return current;
          return [...current, event.message];
        });
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      };
      socket.on("message:new", onMessage);
      unsubscribe = () => socket.off("message:new", onMessage);
    });
    return () => unsubscribe?.();
  }, [channelId]);

  // Optimistic send with a temp id, replaced (or dropped as a duplicate if
  // the socket echo already delivered the real message) once the mutation
  // resolves — a deliberate divergence from the web app, which relies purely
  // on the socket round-trip; mobile networks drop/stall more often, so an
  // optimistic append reads better than a message silently not appearing.
  async function handleSend() {
    const text = body.trim();
    if (!text || !user) return;
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      channelId,
      senderId: user.id,
      senderName: "You",
      body: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setBody("");
    setSending(true);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

    try {
      const sent = await withAuthRetry(() => trpc.chat.sendMessage.mutate({ channelId, body: text }));
      setMessages((current) => {
        const withoutTemp = current.filter((m) => m.id !== tempId);
        if (withoutTemp.some((m) => m.id === sent.id)) return withoutTemp;
        return [...withoutTemp, sent];
      });
    } catch (err) {
      setMessages((current) => current.filter((m) => m.id !== tempId));
      setError(err instanceof Error ? err.message : "Could not send that message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title }} />
      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const mine = item.senderId === user?.id;
            return (
              <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                {!mine && <Text style={styles.senderName}>{item.senderName}</Text>}
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={mine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{item.body}</Text>
                </View>
              </View>
            );
          }}
          contentContainerStyle={styles.messagesContent}
        />
      )}

      <View style={styles.composer}>
        <TextInput style={styles.input} placeholder="Message…" value={body} onChangeText={setBody} multiline />
        <Pressable style={[styles.sendButton, (sending || !body.trim()) && styles.buttonDisabled]} disabled={sending || !body.trim()} onPress={handleSend}>
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: "#b00020", backgroundColor: "#fdecea", padding: 8, fontSize: 12, textAlign: "center" },
  messagesContent: { padding: 12 },
  bubbleRow: { marginBottom: 10, maxWidth: "80%" },
  bubbleRowMine: { alignSelf: "flex-end" },
  bubbleRowTheirs: { alignSelf: "flex-start" },
  senderName: { fontSize: 11, color: "#888", marginBottom: 2, marginLeft: 4 },
  bubble: { borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 },
  bubbleMine: { backgroundColor: "#111" },
  bubbleTheirs: { backgroundColor: "#f0f0f0" },
  bubbleTextMine: { color: "#fff", fontSize: 14 },
  bubbleTextTheirs: { color: "#111", fontSize: 14 },
  composer: { flexDirection: "row", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: "#eee" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 90,
  },
  sendButton: { backgroundColor: "#111", borderRadius: 20, paddingHorizontal: 18, justifyContent: "center" },
  sendButtonText: { color: "#fff", fontWeight: "600" },
  buttonDisabled: { opacity: 0.5 },
});
