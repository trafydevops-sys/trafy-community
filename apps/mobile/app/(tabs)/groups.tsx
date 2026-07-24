import { useEffect, useState } from "react";
import { router } from "expo-router";
import type { StudyGroup } from "@trafy-community/core";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { useAuth } from "@/lib/auth-context";
import { getSocket } from "@/lib/socket";

export default function GroupsScreen() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function load(q?: string) {
    setError(null);
    try {
      const rows = await withAuthRetry(() => trpc.groups.list.query({ query: q || undefined }));
      setGroups(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load study groups.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const group = await withAuthRetry(() => trpc.groups.create.mutate({ name: name.trim() }));
      setName("");
      await load(query || undefined);
      const socket = await getSocket();
      socket?.emit("channel:join", group.channelId);
      router.push(`/(tabs)/chats/${group.channelId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the group.");
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin(group: StudyGroup) {
    setBusyId(group.id);
    setError(null);
    try {
      const updated = await withAuthRetry(() => trpc.groups.join.mutate({ groupId: group.id }));
      setGroups((current) => current.map((g) => (g.id === group.id ? updated : g)));
      const socket = await getSocket();
      socket?.emit("channel:join", updated.channelId);
      router.push(`/(tabs)/chats/${updated.channelId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join that group.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleLeave(group: StudyGroup) {
    setBusyId(group.id);
    setError(null);
    try {
      const updated = await withAuthRetry(() => trpc.groups.leave.mutate({ groupId: group.id }));
      setGroups((current) => current.map((g) => (g.id === group.id ? updated : g)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not leave that group.");
    } finally {
      setBusyId(null);
    }
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

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search groups…"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => load(query)}
        />
        <Pressable style={styles.searchButton} onPress={() => load(query)}>
          <Text style={styles.searchButtonText}>Search</Text>
        </Pressable>
      </View>

      <View style={styles.createRow}>
        <TextInput style={styles.createInput} placeholder="New group name" value={name} onChangeText={setName} />
        <Pressable style={[styles.createButton, (creating || !name.trim()) && styles.buttonDisabled]} disabled={creating || !name.trim()} onPress={handleCreate}>
          {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createButtonText}>Create</Text>}
        </Pressable>
      </View>

      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        ListEmptyComponent={<Text style={styles.empty}>No study groups yet.</Text>}
        renderItem={({ item }) => {
          const isOwner = item.ownerId === user?.id;
          const busy = busyId === item.id;
          return (
            <View style={styles.row}>
              <Pressable style={styles.rowInfo} onPress={() => router.push(`/(tabs)/chats/${item.channelId}`)}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {item.memberCount} member{item.memberCount === 1 ? "" : "s"}
                  {item.topic ? ` · ${item.topic}` : ""}
                </Text>
              </Pressable>
              {isOwner ? (
                <Text style={styles.ownerBadge}>Owner</Text>
              ) : item.isMember ? (
                <Pressable disabled={busy} onPress={() => handleLeave(item)}>
                  {busy ? <ActivityIndicator /> : <Text style={styles.leaveText}>Leave</Text>}
                </Pressable>
              ) : (
                <Pressable disabled={busy} onPress={() => handleJoin(item)}>
                  {busy ? <ActivityIndicator /> : <Text style={styles.joinText}>Join</Text>}
                </Pressable>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: "#b00020", backgroundColor: "#fdecea", padding: 8, fontSize: 12, textAlign: "center" },
  searchRow: { flexDirection: "row", gap: 8, padding: 12 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  searchButton: { backgroundColor: "#eee", borderRadius: 10, paddingHorizontal: 14, justifyContent: "center" },
  searchButtonText: { color: "#111", fontWeight: "600", fontSize: 13 },
  createRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  createInput: { flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  createButton: { backgroundColor: "#111", borderRadius: 10, paddingHorizontal: 14, justifyContent: "center" },
  createButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  buttonDisabled: { opacity: 0.5 },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  rowInfo: { flex: 1, marginRight: 12 },
  rowTitle: { fontWeight: "600", fontSize: 15, marginBottom: 2 },
  rowMeta: { fontSize: 12, color: "#666" },
  ownerBadge: { fontSize: 12, color: "#888", fontWeight: "600" },
  joinText: { color: "#111", fontWeight: "600", fontSize: 13 },
  leaveText: { color: "#b00020", fontWeight: "600", fontSize: 13 },
});
