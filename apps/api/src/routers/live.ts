import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { AccessToken } from "livekit-server-sdk";
import { schema } from "@trafy-community/db";
import { getLiveJoinTokenInput, type LiveJoinInfo } from "@trafy-community/core";
import { router, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";
import { env } from "../lib/env.js";

export const liveRouter = router({
  // No meaningful low-fidelity stub exists for a live video call (unlike
  // email/storage/grading) — without LiveKit configured, we fail clearly
  // instead of pretending a session can be joined.
  getJoinToken: protectedProcedure.input(getLiveJoinTokenInput).mutation(async ({ ctx, input }) => {
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Live sessions aren't configured on this server yet (set LIVEKIT_URL/LIVEKIT_API_KEY/LIVEKIT_API_SECRET).",
      });
    }

    const [lesson] = await db.select().from(schema.courseLessons).where(eq(schema.courseLessons.id, input.lessonId)).limit(1);
    if (!lesson || lesson.contentType !== "live") throw new TRPCError({ code: "NOT_FOUND" });

    const [mod] = await db.select().from(schema.courseModules).where(eq(schema.courseModules.id, lesson.moduleId)).limit(1);
    if (!mod) throw new TRPCError({ code: "NOT_FOUND" });

    const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, mod.courseId)).limit(1);
    if (!course) throw new TRPCError({ code: "NOT_FOUND" });

    const isCreator = course.creatorId === ctx.user.sub;
    if (!isCreator) {
      const [enrollment] = await db
        .select()
        .from(schema.enrollments)
        .where(and(eq(schema.enrollments.courseId, course.id), eq(schema.enrollments.userId, ctx.user.sub)))
        .limit(1);
      if (!enrollment) throw new TRPCError({ code: "FORBIDDEN", message: "Enroll in the course to join its live sessions." });
    }

    // Room scoped to this lesson — every participant (student or creator)
    // who joins lands in the same LiveKit room.
    const roomName = `lesson:${lesson.id}`;
    const accessToken = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, { identity: ctx.user.sub });
    accessToken.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

    const result: LiveJoinInfo = {
      livekitUrl: env.LIVEKIT_URL,
      token: await accessToken.toJwt(),
      roomName,
      lessonTitle: lesson.title,
    };
    return result;
  }),
});
