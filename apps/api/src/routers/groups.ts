import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import {
  createStudyGroupInput,
  listStudyGroupsInput,
  studyGroupIdInput,
  type StudyGroup,
} from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";

async function toStudyGroup(
  row: typeof schema.studyGroups.$inferSelect,
  viewerId: string
): Promise<StudyGroup> {
  const [ownerProfile] = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, row.ownerId))
    .limit(1);

  const memberRows = await db
    .select({ userId: schema.chatChannelMembers.userId })
    .from(schema.chatChannelMembers)
    .where(eq(schema.chatChannelMembers.channelId, row.channelId));

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    topic: row.topic ?? undefined,
    ownerId: row.ownerId,
    ownerName: ownerProfile?.fullName || "",
    channelId: row.channelId,
    memberCount: memberRows.length,
    isMember: memberRows.some((m) => m.userId === viewerId),
    createdAt: row.createdAt.toISOString(),
  };
}

export const groupsRouter = router({
  create: protectedProcedure.input(createStudyGroupInput).mutation(async ({ ctx, input }) => {
    // Each study group is backed by a group chat channel; the owner is its first member.
    const [channel] = await db.insert(schema.chatChannels).values({ type: "group", name: input.name }).returning();
    if (!channel) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    await db.insert(schema.chatChannelMembers).values({ channelId: channel.id, userId: ctx.user.sub });

    const [group] = await db
      .insert(schema.studyGroups)
      .values({
        channelId: channel.id,
        ownerId: ctx.user.sub,
        name: input.name,
        description: input.description,
        topic: input.topic,
      })
      .returning();
    if (!group) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    return toStudyGroup(group, ctx.user.sub);
  }),

  list: protectedProcedure.input(listStudyGroupsInput).query(async ({ ctx, input }) => {
    const whereCondition = input.query
      ? or(ilike(schema.studyGroups.name, `%${input.query}%`), ilike(schema.studyGroups.topic, `%${input.query}%`))
      : undefined;

    const rows = await db
      .select()
      .from(schema.studyGroups)
      .where(whereCondition)
      .orderBy(desc(schema.studyGroups.createdAt));

    return Promise.all(rows.map((r) => toStudyGroup(r, ctx.user.sub)));
  }),

  myGroups: protectedProcedure.query(async ({ ctx }) => {
    const memberChannels = await db
      .select({ channelId: schema.chatChannelMembers.channelId })
      .from(schema.chatChannelMembers)
      .where(eq(schema.chatChannelMembers.userId, ctx.user.sub));
    const channelIds = memberChannels.map((m) => m.channelId);
    if (channelIds.length === 0) return [];

    const rows = await db
      .select()
      .from(schema.studyGroups)
      .where(inArray(schema.studyGroups.channelId, channelIds))
      .orderBy(desc(schema.studyGroups.createdAt));

    return Promise.all(rows.map((r) => toStudyGroup(r, ctx.user.sub)));
  }),

  join: protectedProcedure.input(studyGroupIdInput).mutation(async ({ ctx, input }) => {
    const [group] = await db.select().from(schema.studyGroups).where(eq(schema.studyGroups.id, input.groupId)).limit(1);
    if (!group) throw new TRPCError({ code: "NOT_FOUND" });

    await db
      .insert(schema.chatChannelMembers)
      .values({ channelId: group.channelId, userId: ctx.user.sub })
      .onConflictDoNothing();

    return toStudyGroup(group, ctx.user.sub);
  }),

  leave: protectedProcedure.input(studyGroupIdInput).mutation(async ({ ctx, input }) => {
    const [group] = await db.select().from(schema.studyGroups).where(eq(schema.studyGroups.id, input.groupId)).limit(1);
    if (!group) throw new TRPCError({ code: "NOT_FOUND" });
    if (group.ownerId === ctx.user.sub) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The owner can't leave their own group." });
    }

    await db
      .delete(schema.chatChannelMembers)
      .where(
        and(
          eq(schema.chatChannelMembers.channelId, group.channelId),
          eq(schema.chatChannelMembers.userId, ctx.user.sub)
        )
      );

    return toStudyGroup(group, ctx.user.sub);
  }),
});
