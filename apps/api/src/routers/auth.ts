import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import {
  authTokensSchema,
  refreshInput,
  requestOtpInput,
  verifyOtpInput,
  oauthCallbackInput,
  verifyTotpChallengeInput,
  totpSetupConfirmInput,
  totpDisableInput,
  requestEmailChangeInput,
  confirmEmailChangeInput,
} from "@trafy-community/core";
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../lib/trpc.js";
import { db } from "../lib/db.js";
import { checkRequestRateLimit, generateOtpCode, storeOtpCode, verifyAndConsumeOtpCode } from "../lib/otp.js";
import { sendOtpEmail } from "../lib/mail.js";
import {
  consumeRefreshToken,
  issueRefreshToken,
  revokeRefreshToken,
  signAccessToken,
  signTotpChallengeToken,
  verifyTotpChallengeToken,
} from "../lib/tokens.js";
import { usingEmailStub, env } from "../lib/env.js";
import { exchangeGoogleCode, exchangeLinkedinCode, exchangeGithubCode } from "../lib/oauth.js";
import { capture, identify } from "../lib/posthog.js";
import { encryptSecret, decryptSecret } from "../lib/crypto.js";
import {
  buildSetupPayload,
  consumeBackupCode,
  generateBackupCodes,
  generateTotpSecret,
  verifyTotpCode,
} from "../lib/totp.js";

async function findOrCreateUser(email: string, source: "otp" | "google" | "linkedin" | "github") {
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing) {
    capture(existing.id, "user_logged_in", { source });
    return existing;
  }

  const [created] = await db.insert(schema.users).values({ email }).returning();
  if (!created) throw new Error("Failed to create user");
  await db.insert(schema.profiles).values({ userId: created.id, fullName: "" });
  await db.insert(schema.privacySettings).values({ userId: created.id });
  identify(created.id, { email, signup_source: source });
  capture(created.id, "user_signed_up", { source });
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

    const user = await findOrCreateUser(input.email, "otp");

    // The email code is only the first factor once TOTP is enabled — no
    // session yet, just a short-lived proof this step passed.
    if (user.totpEnabled) {
      return { totpRequired: true as const, challengeToken: await signTotpChallengeToken(user.id, user.email) };
    }

    return { totpRequired: false as const, ...(await issueSessionFor(user.id, user.email)) };
  }),

  verifyTotpChallenge: publicProcedure.input(verifyTotpChallengeInput).mutation(async ({ input }) => {
    let claim: { sub: string; email: string };
    try {
      claim = await verifyTotpChallengeToken(input.challengeToken);
    } catch {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "This sign-in attempt has expired — start again." });
    }

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, claim.sub)).limit(1);
    if (!user || !user.totpEnabled || !user.totpSecretEnc) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Two-step verification is no longer enabled on this account." });
    }

    const secret = decryptSecret(user.totpSecretEnc);
    const isValidTotp = verifyTotpCode(user.email, secret, input.code);

    if (!isValidTotp) {
      const hashes = user.totpBackupCodeHashes ?? [];
      const next = consumeBackupCode(hashes, input.code);
      if (!next) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That code is incorrect or has expired." });
      }
      await db.update(schema.users).set({ totpBackupCodeHashes: next }).where(eq(schema.users.id, user.id));
      capture(user.id, "totp_backup_code_used");
    }

    return issueSessionFor(user.id, user.email);
  }),

  oauthCallback: publicProcedure.input(oauthCallbackInput).mutation(async ({ input }) => {
    try {
      let email: string;
      if (input.provider === "google") {
        email = await exchangeGoogleCode(input.code, input.redirectUri);
      } else if (input.provider === "linkedin") {
        email = await exchangeLinkedinCode(input.code, input.redirectUri);
      } else if (input.provider === "github") {
        email = await exchangeGithubCode(input.code, input.redirectUri);
      } else {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported provider" });
      }

      const user = await findOrCreateUser(email, input.provider);
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
      githubClientId: env.GITHUB_CLIENT_ID || null,
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
    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      totpEnabled: user.totpEnabled,
    };
  }),

  // --- Two-step verification (TOTP) ---------------------------------------

  totpSetupBegin: protectedProcedure.mutation(async ({ ctx }) => {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, ctx.user.sub)).limit(1);
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    if (user.totpEnabled) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Two-step verification is already on. Turn it off before setting it up again." });
    }

    // Not persisted yet — the secret only round-trips to the client (as it
    // must, to render the QR code) and back on totpSetupConfirm, which is
    // the first point it's written to the database, and only once a code
    // generated from it has actually been verified.
    const secret = generateTotpSecret();
    return buildSetupPayload(user.email, secret);
  }),

  totpSetupConfirm: protectedProcedure.input(totpSetupConfirmInput).mutation(async ({ ctx, input }) => {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, ctx.user.sub)).limit(1);
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    if (user.totpEnabled) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Two-step verification is already on." });
    }

    if (!verifyTotpCode(user.email, input.base32Secret, input.code)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That code is incorrect. Check your authenticator app and try again." });
    }

    const { plaintext, hashes } = generateBackupCodes();
    await db
      .update(schema.users)
      .set({ totpSecretEnc: encryptSecret(input.base32Secret), totpEnabled: true, totpBackupCodeHashes: hashes })
      .where(eq(schema.users.id, user.id));

    capture(user.id, "totp_enabled");
    return { backupCodes: plaintext };
  }),

  totpDisable: protectedProcedure.input(totpDisableInput).mutation(async ({ ctx, input }) => {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, ctx.user.sub)).limit(1);
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    if (!user.totpEnabled || !user.totpSecretEnc) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Two-step verification isn't on." });
    }

    const secret = decryptSecret(user.totpSecretEnc);
    const isValidTotp = verifyTotpCode(user.email, secret, input.code);
    const isValidBackup = !isValidTotp && consumeBackupCode(user.totpBackupCodeHashes ?? [], input.code) !== null;
    if (!isValidTotp && !isValidBackup) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That code is incorrect." });
    }

    await db
      .update(schema.users)
      .set({ totpSecretEnc: null, totpEnabled: false, totpBackupCodeHashes: null })
      .where(eq(schema.users.id, user.id));

    capture(user.id, "totp_disabled");
    return { ok: true as const };
  }),

  // --- Account email --------------------------------------------------------

  requestEmailChange: protectedProcedure.input(requestEmailChangeInput).mutation(async ({ ctx, input }) => {
    const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, input.newEmail)).limit(1);
    if (existing) {
      throw new TRPCError({ code: "CONFLICT", message: "That email is already in use by another account." });
    }

    await checkRequestRateLimit(input.newEmail);
    const code = generateOtpCode();
    await storeOtpCode(input.newEmail, code);
    await sendOtpEmail(input.newEmail, code);

    return { ok: true as const, devCode: usingEmailStub ? code : undefined };
  }),

  confirmEmailChange: protectedProcedure.input(confirmEmailChangeInput).mutation(async ({ ctx, input }) => {
    try {
      await verifyAndConsumeOtpCode(input.newEmail, input.code);
    } catch (err) {
      throw new TRPCError({ code: "BAD_REQUEST", message: (err as Error).message });
    }

    // Re-check uniqueness: the window between requestEmailChange and this
    // call is exactly where a race with another signup could land.
    const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, input.newEmail)).limit(1);
    if (existing) {
      throw new TRPCError({ code: "CONFLICT", message: "That email is already in use by another account." });
    }

    await db
      .update(schema.users)
      .set({ email: input.newEmail, updatedAt: new Date() })
      .where(eq(schema.users.id, ctx.user.sub));

    capture(ctx.user.sub, "email_changed");
    // The access token embeds the old email — reissue so the client (and
    // every subsequent request) reflects the new one immediately.
    return issueSessionFor(ctx.user.sub, input.newEmail);
  }),

  // --- Sessions ---------------------------------------------------------

  revokeAllSessions: protectedProcedure.mutation(async ({ ctx }) => {
    const revoked = await db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.refreshTokens.userId, ctx.user.sub), isNull(schema.refreshTokens.revokedAt)))
      .returning({ id: schema.refreshTokens.id });

    capture(ctx.user.sub, "all_sessions_revoked", { count: revoked.length });
    return { ok: true as const, revokedCount: revoked.length };
  }),
});
