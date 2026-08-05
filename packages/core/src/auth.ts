import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email();

export const requestOtpInput = z.object({
  email: emailSchema,
});
export type RequestOtpInput = z.infer<typeof requestOtpInput>;

export const otpCodeSchema = z
  .string()
  .trim()
  .length(6)
  .regex(/^[0-9]{6}$/, "OTP must be 6 digits");

export const verifyOtpInput = z.object({
  email: emailSchema,
  code: otpCodeSchema,
});
export type VerifyOtpInput = z.infer<typeof verifyOtpInput>;

export const oauthCallbackInput = z.object({
  provider: z.enum(["google", "linkedin", "github"]),
  code: z.string().min(1),
  redirectUri: z.string().url(),
});
export type OauthCallbackInput = z.infer<typeof oauthCallbackInput>;

export const refreshInput = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshInput>;

export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: emailSchema,
  createdAt: z.string(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: authUserSchema,
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

// verifyOtp's actual result: either a completed sign-in, or — when the
// account has TOTP enabled — a short-lived challenge that must be resolved
// with auth.verifyTotpChallenge before any session is issued. The email code
// alone is never sufficient once 2FA is on.
export const verifyOtpResultSchema = z.discriminatedUnion("totpRequired", [
  authTokensSchema.extend({ totpRequired: z.literal(false) }),
  z.object({ totpRequired: z.literal(true), challengeToken: z.string() }),
]);
export type VerifyOtpResult = z.infer<typeof verifyOtpResultSchema>;

export const verifyTotpChallengeInput = z.object({
  challengeToken: z.string().min(1),
  // A TOTP code (6 digits) or a backup code ("XXXXX-XXXXX") — either is
  // accepted here, see apps/api/src/lib/totp.ts.
  code: z.string().min(6).max(11),
});
export type VerifyTotpChallengeInput = z.infer<typeof verifyTotpChallengeInput>;

export const totpSetupBeginOutput = z.object({
  base32Secret: z.string(),
  otpauthUrl: z.string(),
  qrCodeDataUrl: z.string(),
});
export type TotpSetupBeginOutput = z.infer<typeof totpSetupBeginOutput>;

export const totpSetupConfirmInput = z.object({
  base32Secret: z.string().min(1),
  code: otpCodeSchema,
});
export type TotpSetupConfirmInput = z.infer<typeof totpSetupConfirmInput>;

export const totpSetupConfirmOutput = z.object({
  backupCodes: z.array(z.string()),
});
export type TotpSetupConfirmOutput = z.infer<typeof totpSetupConfirmOutput>;

export const totpDisableInput = z.object({
  // Require re-proving possession of the second factor (or a backup code) to
  // turn 2FA off — otherwise a hijacked, already-open session could disable
  // it unilaterally.
  code: z.string().min(6).max(11),
});
export type TotpDisableInput = z.infer<typeof totpDisableInput>;

export const requestEmailChangeInput = z.object({
  newEmail: emailSchema,
});
export type RequestEmailChangeInput = z.infer<typeof requestEmailChangeInput>;

export const confirmEmailChangeInput = z.object({
  newEmail: emailSchema,
  code: otpCodeSchema,
});
export type ConfirmEmailChangeInput = z.infer<typeof confirmEmailChangeInput>;

export const accessTokenPayloadSchema = z.object({
  sub: z.string().uuid(),
  email: emailSchema,
  type: z.literal("access"),
});
export type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>;

export const refreshTokenPayloadSchema = z.object({
  sub: z.string().uuid(),
  jti: z.string().uuid(),
  type: z.literal("refresh"),
});
export type RefreshTokenPayload = z.infer<typeof refreshTokenPayloadSchema>;
