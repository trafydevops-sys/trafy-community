import { TRPCError } from "@trpc/server";
import { and, desc, eq, lt, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { schema } from "@trafy-community/db";
import {
  createGroupInput,
  getOrCreateDmInput,
  listMessagesInput,
  markReadInput,
  sendInmailInput,
  sendMessageInput,
  type Channel,
  type ListMessagesOutput,
  type Message,
} from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";
import { notify } from "../lib/notify.js";
import { emitMessageRead, emitNewMessage } from "../lib/realtime.js";
async function assertMember(channelId: string, userId: string): Promise<void> {
  const [membership] = await db
    .select()
    .from(schema.chatChannelMembers)
    .where(and(eq(schema.chatChannelMembers.channelId, channelId), eq(schema.chatChannelMembers.userId, userId)))
    .limit(1);
  if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this channel." });
}

async function memberCount(channelId: string): Promise<number> {
  const rows = await db
    .select()
    .from(schema.chatChannelMembers)
    .where(eq(schema.chatChannelMembers.channelId, channelId));
  return rows.length;
}

export const chatRouter = router({
  listChannels: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await db
      .select({ channelId: schema.chatChannelMembers.channelId })
      .from(schema.chatChannelMembers)
      .where(eq(schema.chatChannelMembers.userId, ctx.user.sub));

    const channels: Channel[] = [];
    for (const { channelId } of memberships) {
      const [channel] = await db.select().from(schema.chatChannels).where(eq(schema.chatChannels.id, channelId)).limit(1);
      if (!channel) continue;

      let name = channel.name ?? undefined;
      if (channel.type === "dm") {
        const [other] = await db
          .select({ fullName: schema.profiles.fullName, userId: schema.chatChannelMembers.userId })
          .from(schema.chatChannelMembers)
          .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.chatChannelMembers.userId))
          .where(and(eq(schema.chatChannelMembers.channelId, channelId), ne(schema.chatChannelMembers.userId, ctx.user.sub)))
          .limit(1);
        name = other?.fullName || undefined;
      }

      const [lastMessageRow] = await db
        .select()
        .from(schema.chatMessages)
        .where(eq(schema.chatMessages.channelId, channelId))
        .orderBy(desc(schema.chatMessages.createdAt))
        .limit(1);

      channels.push({
        id: channel.id,
        type: channel.type as Channel["type"],
        name,
        memberCount: await memberCount(channelId),
        lastMessage: lastMessageRow
          ? {
              body: lastMessageRow.body,
              senderId: lastMessageRow.senderId,
              createdAt: lastMessageRow.createdAt.toISOString(),
            }
          : undefined,
      });
    }

    channels.sort((a, b) => (b.lastMessage?.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? ""));
    return channels;
  }),

  getOrCreateDm: protectedProcedure.input(getOrCreateDmInput).mutation(async ({ ctx, input }) => {
    if (input.userId === ctx.user.sub) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "You can't DM yourself." });
    }

    const m1 = alias(schema.chatChannelMembers, "m1");
    const m2 = alias(schema.chatChannelMembers, "m2");
    const [existing] = await db
      .select({ id: schema.chatChannels.id })
      .from(schema.chatChannels)
      .innerJoin(m1, and(eq(m1.channelId, schema.chatChannels.id), eq(m1.userId, ctx.user.sub)))
      .innerJoin(m2, and(eq(m2.channelId, schema.chatChannels.id), eq(m2.userId, input.userId)))
      .where(eq(schema.chatChannels.type, "dm"))
      .limit(1);

    if (existing) return { channelId: existing.id };

    const [channel] = await db.insert(schema.chatChannels).values({ type: "dm" }).returning();
    if (!channel) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    await db.insert(schema.chatChannelMembers).values([
      { channelId: channel.id, userId: ctx.user.sub },
      { channelId: channel.id, userId: input.userId },
    ]);

    return { channelId: channel.id };
  }),

  createGroup: protectedProcedure.input(createGroupInput).mutation(async ({ ctx, input }) => {
    const [channel] = await db
      .insert(schema.chatChannels)
      .values({ type: "group", name: input.name })
      .returning();
    if (!channel) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const memberIds = Array.from(new Set([ctx.user.sub, ...input.memberIds]));
    await db.insert(schema.chatChannelMembers).values(memberIds.map((userId) => ({ channelId: channel.id, userId })));

    return { channelId: channel.id };
  }),

  listMessages: protectedProcedure.input(listMessagesInput).query(async ({ ctx, input }) => {
    await assertMember(input.channelId, ctx.user.sub);

    let cursorCreatedAt: Date | undefined;
    if (input.cursor) {
      const [cursorRow] = await db
        .select({ createdAt: schema.chatMessages.createdAt })
        .from(schema.chatMessages)
        .where(eq(schema.chatMessages.id, input.cursor))
        .limit(1);
      cursorCreatedAt = cursorRow?.createdAt;
    }

    const whereCondition = cursorCreatedAt
      ? and(eq(schema.chatMessages.channelId, input.channelId), lt(schema.chatMessages.createdAt, cursorCreatedAt))
      : eq(schema.chatMessages.channelId, input.channelId);

    const rows = await db
      .select({
        id: schema.chatMessages.id,
        channelId: schema.chatMessages.channelId,
        senderId: schema.chatMessages.senderId,
        body: schema.chatMessages.body,
        mediaUrl: schema.chatMessages.mediaUrl,
        mediaKind: schema.chatMessages.mediaKind,
        isInmail: schema.chatMessages.isInmail,
        createdAt: schema.chatMessages.createdAt,
        senderName: schema.profiles.fullName,
      })
      .from(schema.chatMessages)
      .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.chatMessages.senderId))
      .where(whereCondition)
      .orderBy(desc(schema.chatMessages.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;

    const messages: Message[] = page
      .map((r) => ({
        id: r.id,
        channelId: r.channelId,
        senderId: r.senderId,
        senderName: r.senderName || "",
        body: r.body,
        mediaUrl: r.mediaUrl,
        mediaKind: r.mediaKind,
        isInmail: r.isInmail,
        createdAt: r.createdAt.toISOString(),
      }))
      .reverse(); // oldest-first for rendering top-to-bottom

    const output: ListMessagesOutput = { messages, nextCursor: hasMore ? page[page.length - 1]?.id : undefined };
    return output;
  }),

  markRead: protectedProcedure.input(markReadInput).mutation(async ({ ctx, input }) => {
    await assertMember(input.channelId, ctx.user.sub);
    await db
      .insert(schema.messageReads)
      .values({
        messageId: input.upToMessageId,
        userId: ctx.user.sub,
        readAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.messageReads.messageId, schema.messageReads.userId],
        set: { readAt: new Date() },
      });
    
    emitMessageRead({ channelId: input.channelId, userId: ctx.user.sub, readUpToId: input.upToMessageId });
    return { success: true };
  }),

  sendMessage: protectedProcedure.input(sendMessageInput).mutation(async ({ ctx, input }) => {
    await assertMember(input.channelId, ctx.user.sub);

    const [row] = await db
      .insert(schema.chatMessages)
      .values({ 
        channelId: input.channelId, 
        senderId: ctx.user.sub, 
        body: input.body || "", 
        mediaUrl: input.mediaUrl, 
        mediaKind: input.mediaKind 
      })
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, ctx.user.sub)).limit(1);
    const message: Message = {
      id: row.id,
      channelId: row.channelId,
      senderId: row.senderId,
      senderName: profile?.fullName || ctx.user.email,
      body: row.body,
      mediaUrl: row.mediaUrl,
      mediaKind: row.mediaKind,
      isInmail: row.isInmail,
      createdAt: row.createdAt.toISOString(),
    };

    emitNewMessage({ channelId: input.channelId, message });

    const members = await db
      .select({ userId: schema.chatChannelMembers.userId })
      .from(schema.chatChannelMembers)
      .where(and(eq(schema.chatChannelMembers.channelId, input.channelId), ne(schema.chatChannelMembers.userId, ctx.user.sub)));
    await Promise.all(
      members.map((m) =>
        notify(m.userId, "chat_message", {
          actorId: ctx.user.sub,
          actorName: message.senderName,
          channelId: input.channelId,
        })
      )
    );

    return message;
  }),

  sendInmail: protectedProcedure.input(sendInmailInput).mutation(async ({ ctx, input }) => {
    // 1. Verify recruiter role
    const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, ctx.user.sub)).limit(1);
    if (profile?.userRole !== "recruiter") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only recruiters can send InMail." });
    }

    // 2. Check quota (Redis INCR with TTL) - Simplified logic here
    const maxDaily = 5;
    // In a real app we'd use Redis, e.g.:
    // const today = new Date().toISOString().split("T")[0];
    // const key = `inmail:quota:${ctx.user.sub}:${today}`;
    // const count = await redis.incr(key);
    // if (count === 1) await redis.expire(key, 86400);
    // if (count > maxDaily) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Daily InMail limit reached." });

    // 3. Find or create DM channel
    const m1 = alias(schema.chatChannelMembers, "m1");
    const m2 = alias(schema.chatChannelMembers, "m2");
    let channelId: string;
    const [existing] = await db
      .select({ id: schema.chatChannels.id })
      .from(schema.chatChannels)
      .innerJoin(m1, and(eq(m1.channelId, schema.chatChannels.id), eq(m1.userId, ctx.user.sub)))
      .innerJoin(m2, and(eq(m2.channelId, schema.chatChannels.id), eq(m2.userId, input.addresseeId)))
      .where(eq(schema.chatChannels.type, "dm"))
      .limit(1);

    if (existing) {
      channelId = existing.id;
    } else {
      const [channel] = await db.insert(schema.chatChannels).values({ type: "dm", inmailDailyLimit: maxDaily }).returning();
      if (!channel) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      channelId = channel.id;
      await db.insert(schema.chatChannelMembers).values([
        { channelId, userId: ctx.user.sub },
        { channelId, userId: input.addresseeId },
      ]);
    }

    // 4. Insert message with isInmail=true
    const fullBody = `**Subject:** ${input.subject}\n\n${input.body}`;
    const [row] = await db
      .insert(schema.chatMessages)
      .values({
        channelId,
        senderId: ctx.user.sub,
        body: fullBody,
        isInmail: true,
      })
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const message: Message = {
      id: row.id,
      channelId: row.channelId,
      senderId: row.senderId,
      senderName: profile?.fullName || ctx.user.email,
      body: row.body,
      mediaUrl: row.mediaUrl,
      mediaKind: row.mediaKind,
      isInmail: row.isInmail,
      createdAt: row.createdAt.toISOString(),
    };

    emitNewMessage({ channelId, message });
    notify(input.addresseeId, "chat_message", { actorId: ctx.user.sub, actorName: message.senderName, channelId });

    return message;
  }),
});
