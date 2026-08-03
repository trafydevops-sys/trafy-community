import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import {
  authTokensSchema,
  refreshInput,
  requestOtpInput,
  verifyOtpInput,
  oauthCallbackInput,
} from "@trafy-community/core";
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";
import { checkRequestRateLimit, generateOtpCode, storeOtpCode, verifyAndConsumeOtpCode } from "../lib/otp.js";
import { sendOtpEmail } from "../lib/mail.js";
import { consumeRefreshToken, issueRefreshToken, revokeRefreshToken, signAccessToken } from "../lib/tokens.js";
import { usingEmailStub, env } from "../lib/env.js";
import { exchangeGoogleCode, exchangeLinkedinCode } from "../lib/oauth.js";

async function findOrCreateUser(email: string) {
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(schema.users).values({ email }).returning();
  if (!created) throw new Error("Failed to create user");
  await db.insert(schema.profiles).values({ userId: created.id, fullName: "" });
  await db.insert(schema.privacySettings).values({ userId: created.id });
  return created;
}

async function issueSessionFor(userId: string, email: string) {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(userId, email),
    issueRefreshToken(userId),
  ]);
  return authTokensSchema.parse({
    accessToken,
    refreshToken,
    user: { id: userId, email, createdAt: new Date().toISOString() },
  });
}

export const authRouter = router({
  requestOtp: publicProcedure.input(requestOtpInput).mutation(async ({ input }) => {
    await checkRequestRateLimit(input.email);
    const code = generateOtpCode();
    await storeOtpCode(input.email, code);
    await sendOtpEmail(input.email, code);

    // The dev stub already logs the code to the console; surfacing it in the
    // response too makes local testing/demos frictionless without an email
    // provider. Never returned once RESEND_API_KEY is set (real inboxes).
    return { ok: true as const, devCode: usingEmailStub ? code : undefined };
  }),

  verifyOtp: publicProcedure.input(verifyOtpInput).mutation(async ({ input }) => {
    try {
      await verifyAndConsumeOtpCode(input.email, input.code);
    } catch (err) {
      throw new TRPCError({ code: "BAD_REQUEST", message: (err as Error).message });
    }

    const user = await findOrCreateUser(input.email);
    return issueSessionFor(user.id, user.email);
  }),

  oauthCallback: publicProcedure.input(oauthCallbackInput).mutation(async ({ input }) => {
    try {
      let email: string;
      if (input.provider === "google") {
        email = await exchangeGoogleCode(input.code, input.redirectUri);
      } else if (input.provider === "linkedin") {
        email = await exchangeLinkedinCode(input.code, input.redirectUri);
      } else {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported provider" });
      }

      const user = await findOrCreateUser(email);
      return issueSessionFor(user.id, user.email);
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (err as Error).message });
    }
  }),

  oauthConfig: publicProcedure.query(() => {
    return {
      googleClientId: env.GOOGLE_CLIENT_ID || null,
      linkedinClientId: env.LINKEDIN_CLIENT_ID || null,
    };
  }),

  refresh: publicProcedure.input(refreshInput).mutation(async ({ input }) => {
    try {
      const { userId } = await consumeRefreshToken(input.refreshToken);
      const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      if (!user) throw new Error("User no longer exists");
      return issueSessionFor(user.id, user.email);
    } catch (err) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: (err as Error).message });
    }
  }),

  logout: publicProcedure.input(z.object({ refreshToken: z.string() })).mutation(async ({ input }) => {
    await revokeRefreshToken(input.refreshToken);
    return { ok: true as const };
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, ctx.user.sub)).limit(1);
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    return { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() };
  }),
});
