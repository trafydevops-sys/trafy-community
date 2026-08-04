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
