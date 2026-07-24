import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Post } from "@trafy-community/core";

const CACHE_KEY = "trafy-community.feed-cache";

/**
 * Offline cache for the first page of the feed only — enough to show
 * something instantly on launch (or with no connectivity) rather than a
 * blank/loading screen. Not a full offline-first architecture: there's no
 * mutation queue, so posting/reacting while offline just fails visibly
 * rather than being replayed later.
 */
export async function getCachedFeed(): Promise<Post[] | null> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Post[];
  } catch {
    return null;
  }
}

export async function setCachedFeed(posts: Post[]): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(posts));
}
