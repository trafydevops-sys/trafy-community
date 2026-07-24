import { useEffect, useState } from "react";
import type { Post } from "@trafy-community/core";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { useAuth } from "@/lib/auth-context";
import { getCachedFeed, setCachedFeed } from "@/lib/feed-cache";

export default function FeedScreen() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  async function loadFresh() {
    try {
      const result = await withAuthRetry(() => trpc.posts.feed.query({ scope: "everyone" }));
      setPosts(result.posts);
      setOffline(false);
      await setCachedFeed(result.posts);
    } catch {
      // Keep whatever's on screen (cache or previous state) and flag that
      // this is possibly stale — this is the whole point of the cache.
      setOffline(true);
    }
  }

  useEffect(() => {
    (async () => {
      const cached = await getCachedFeed();
      if (cached) {
        setPosts(cached);
        setLoading(false);
      }
      await loadFresh();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await loadFresh();
    setRefreshing(false);
  }

  async function handlePost() {
    if (!body.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const post = await withAuthRetry(() => trpc.posts.create.mutate({ body: body.trim() }));
      setBody("");
      setPosts((current) => {
        const next = [post, ...current];
        void setCachedFeed(next);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post. Try again.");
    } finally {
      setPosting(false);
    }
  }

  // Optimistic like/unlike, same convention as the web app: flip locally,
  // only reconcile with the server on failure (see Milestone 8 notes — the
  // API only returns {reacted}, not a fresh count, so concurrent reactions
  // from other devices can drift until the next full reload).
  async function handleReact(post: Post) {
    const wasReacted = post.reactedByMe;
    setPosts((current) =>
      current.map((p) =>
        p.id === post.id
          ? { ...p, reactedByMe: !wasReacted, reactionCount: p.reactionCount + (wasReacted ? -1 : 1) }
          : p
      )
    );
    try {
      await withAuthRetry(() => trpc.posts.react.mutate({ postId: post.id }));
    } catch {
      await loadFresh();
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
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {offline && <Text style={styles.offlineBanner}>You're viewing cached posts — offline or the server is unreachable.</Text>}
      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.composer}>
        <TextInput
          style={styles.composerInput}
          placeholder="Share something…"
          value={body}
          onChangeText={setBody}
          multiline
        />
        <Pressable style={[styles.postButton, (posting || !body.trim()) && styles.buttonDisabled]} disabled={posting || !body.trim()} onPress={handlePost}>
          {posting ? <ActivityIndicator color="#fff" /> : <Text style={styles.postButtonText}>Post</Text>}
        </Pressable>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={<Text style={styles.empty}>No posts yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.postCard}>
            <Text style={styles.postAuthor}>{item.author.id === user?.id ? "You" : item.author.fullName}</Text>
            <Text style={styles.postBody}>{item.body}</Text>
            <View style={styles.postFooter}>
              <Pressable onPress={() => handleReact(item)}>
                <Text style={[styles.reactButton, item.reactedByMe && styles.reactButtonActive]}>
                  {item.reactedByMe ? "♥" : "♡"} {item.reactionCount}
                </Text>
              </Pressable>
              <Text style={styles.postDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
            </View>
          </View>
        )}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  offlineBanner: {
    backgroundColor: "#fff6db",
    color: "#7a5a00",
    fontSize: 12,
    padding: 8,
    textAlign: "center",
  },
  error: { color: "#b00020", backgroundColor: "#fdecea", padding: 8, fontSize: 12, textAlign: "center" },
  composer: { flexDirection: "row", padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: "#eee" },
  composerInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 90,
  },
  postButton: { backgroundColor: "#111", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  postButtonText: { color: "#fff", fontWeight: "600" },
  buttonDisabled: { opacity: 0.5 },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  postCard: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  postAuthor: { fontWeight: "600", fontSize: 14, marginBottom: 4 },
  postBody: { fontSize: 14, color: "#222", lineHeight: 20, marginBottom: 8 },
  postFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reactButton: { fontSize: 14, color: "#555" },
  reactButtonActive: { color: "#c2185b" },
  postDate: { fontSize: 11, color: "#999" },
});
