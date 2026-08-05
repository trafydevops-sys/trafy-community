import { Archiver, ZipArchive } from "archiver";
import { desc, eq } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import { db } from "./db.js";

/**
 * Builds a "download a copy of your data" zip: everything the profile,
 * privacy, posts, connections, and messages tables hold for one user, as
 * pretty-printed JSON files. Streamed rather than buffered so a large
 * history doesn't hold the whole archive in memory at once.
 */
export function buildDataExport(userId: string, email: string): Archiver {
  const archive = new ZipArchive({ zlib: { level: 9 } });

  void (async () => {
    try {
      const [[account], [profile], [privacy], posts, comments, connections, sentMessages] = await Promise.all([
        db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1),
        db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1),
        db.select().from(schema.privacySettings).where(eq(schema.privacySettings.userId, userId)).limit(1),
        db.select().from(schema.posts).where(eq(schema.posts.authorId, userId)).orderBy(desc(schema.posts.createdAt)),
        db
          .select()
          .from(schema.postComments)
          .where(eq(schema.postComments.authorId, userId))
          .orderBy(desc(schema.postComments.createdAt)),
        db.select().from(schema.connections).where(eq(schema.connections.requesterId, userId)),
        db
          .select()
          .from(schema.chatMessages)
          .where(eq(schema.chatMessages.senderId, userId))
          .orderBy(desc(schema.chatMessages.createdAt)),
      ]);

      const connectionsReceived = await db
        .select()
        .from(schema.connections)
        .where(eq(schema.connections.addresseeId, userId));

      const json = (data: unknown) => JSON.stringify(data, null, 2);

      archive.append(json({ id: account?.id, email: account?.email, createdAt: account?.createdAt }), {
        name: "account.json",
      });
      archive.append(json(profile ?? null), { name: "profile.json" });
      archive.append(json(privacy ?? null), { name: "privacy_settings.json" });
      archive.append(json(posts), { name: "posts.json" });
      archive.append(json(comments), { name: "post_comments.json" });
      archive.append(json({ requestedByYou: connections, receivedByYou: connectionsReceived }), {
        name: "connections.json",
      });
      archive.append(json(sentMessages), { name: "messages_sent.json" });
      archive.append(
        [
          `Trafy Community — data export for ${email}`,
          `Generated ${new Date().toISOString()}`,
          "",
          "messages_sent.json contains only messages you sent — not full",
          "conversation history, to avoid bundling other people's messages",
          "into your archive.",
        ].join("\n"),
        { name: "README.txt" }
      );

      await archive.finalize();
    } catch (err) {
      archive.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return archive;
}
