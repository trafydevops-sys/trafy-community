import {
  connectionStatusSchema,
  myConnectionsInput,
  respondConnectionInput,
  sendConnectionInput,
} from "@trafy-community/core";
import { and, desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@trafy-community/db";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";

export const connectionsRouter = router({
  send: protectedProcedure
    .input(sendConnectionInput)
    .mutation(async ({ ctx, input }) => {
      const requesterId = ctx.user.sub;
      const { addresseeId, note } = input;

      if (requesterId === addresseeId) {
        throw new Error("Cannot send connection request to yourself");
      }

      // Check existing connection
      const existing = await db.query.connections.findFirst({
        where: or(
          and(eq(schema.connections.requesterId, requesterId), eq(schema.connections.addresseeId, addresseeId)),
          and(eq(schema.connections.requesterId, addresseeId), eq(schema.connections.addresseeId, requesterId))
        ),
      });

      if (existing) {
        if (existing.status === "pending") {
          throw new Error("Connection request already pending");
        } else if (existing.status === "accepted") {
          throw new Error("Already connected");
        } else if (existing.status === "rejected" || existing.status === "withdrawn") {
          // If the previous request was rejected or withdrawn, we can insert a new one or update the existing one.
          // Let's update the existing one.
          const [updated] = await db
            .update(schema.connections)
            .set({
              requesterId,
              addresseeId,
              status: "pending",
              note,
              updatedAt: new Date(),
            })
            .where(eq(schema.connections.id, existing.id))
            .returning();

          await db.insert(schema.notifications).values({
            userId: addresseeId,
            type: "connection_request",
            payload: { actorId: requesterId, actorName: ctx.user.email },
          });

          return updated;
        }
      }

      const [conn] = await db
        .insert(schema.connections)
        .values({
          requesterId,
          addresseeId,
          note,
          status: "pending",
        })
        .returning();

      // Notify addressee
      await db.insert(schema.notifications).values({
        userId: addresseeId,
        type: "connection_request",
        payload: { actorId: requesterId, actorName: ctx.user.email }, // In a real app we'd fetch profile name
      });

      return conn;
    }),

  respond: protectedProcedure
    .input(respondConnectionInput)
    .mutation(async ({ ctx, input }) => {
      const { connectionId, action } = input;

      const conn = await db.query.connections.findFirst({
        where: and(eq(schema.connections.id, connectionId), eq(schema.connections.addresseeId, ctx.user.sub)),
      });

      if (!conn) {
        throw new Error("Connection request not found");
      }

      if (conn.status !== "pending") {
        throw new Error(`Cannot respond to a request in ${conn.status} state`);
      }

      const [updated] = await db
        .update(schema.connections)
        .set({ status: action === "accept" ? "accepted" : "rejected", updatedAt: new Date() })
        .where(eq(schema.connections.id, connectionId))
        .returning();

      if (action === "accept") {
        // Upsert mutual follows
        await db
          .insert(schema.follows)
          .values([
            { followerId: conn.requesterId, followingId: conn.addresseeId },
            { followerId: conn.addresseeId, followingId: conn.requesterId },
          ])
          .onConflictDoNothing();

        // Notify requester
        await db.insert(schema.notifications).values({
          userId: conn.requesterId,
          type: "connection_accepted",
          payload: { actorId: ctx.user.sub, actorName: ctx.user.email },
        });
      }

      return updated;
    }),

  withdraw: protectedProcedure
    .input(z.object({ connectionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await db.query.connections.findFirst({
        where: and(eq(schema.connections.id, input.connectionId), eq(schema.connections.requesterId, ctx.user.sub)),
      });

      if (!conn) {
        throw new Error("Connection request not found");
      }

      if (conn.status !== "pending") {
        throw new Error("Can only withdraw pending requests");
      }

      const [updated] = await db
        .update(schema.connections)
        .set({ status: "withdrawn", updatedAt: new Date() })
        .where(eq(schema.connections.id, input.connectionId))
        .returning();

      return updated;
    }),

  list: protectedProcedure
    .input(myConnectionsInput)
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.sub;
      const { status, direction } = input;

      let whereClause;
      if (status === "accepted") {
        whereClause = and(
          eq(schema.connections.status, "accepted"),
          or(eq(schema.connections.requesterId, userId), eq(schema.connections.addresseeId, userId))
        );
      } else if (status === "pending") {
        if (direction === "sent") {
          whereClause = and(eq(schema.connections.status, "pending"), eq(schema.connections.requesterId, userId));
        } else if (direction === "received") {
          whereClause = and(eq(schema.connections.status, "pending"), eq(schema.connections.addresseeId, userId));
        } else {
          whereClause = and(
            eq(schema.connections.status, "pending"),
            or(eq(schema.connections.requesterId, userId), eq(schema.connections.addresseeId, userId))
          );
        }
      }

      const rows = await db
        .select({
          connection: schema.connections,
          user: schema.users,
          profile: schema.profiles,
        })
        .from(schema.connections)
        .innerJoin(
          schema.users,
          or(
            and(eq(schema.connections.requesterId, userId), eq(schema.users.id, schema.connections.addresseeId)),
            and(eq(schema.connections.addresseeId, userId), eq(schema.users.id, schema.connections.requesterId))
          )
        )
        .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id))
        .where(whereClause)
        .orderBy(desc(schema.connections.updatedAt))
        .limit(50); // Hardcoded limit for now

      return rows.map((r: any) => ({
        ...r.connection,
        otherUser: {
          id: r.user.id,
          fullName: r.profile?.fullName || r.user.email,
          title: r.profile?.title || null,
          avatarUrl: "",
        }
      }));
    }),

  status: protectedProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const requesterId = ctx.user.sub;
      const addresseeId = input.userId;

      if (requesterId === addresseeId) {
        return null;
      }

      const existing = await db.query.connections.findFirst({
        where: or(
          and(eq(schema.connections.requesterId, requesterId), eq(schema.connections.addresseeId, addresseeId)),
          and(eq(schema.connections.requesterId, addresseeId), eq(schema.connections.addresseeId, requesterId))
        ),
      });

      return existing || null;
    }),
});
