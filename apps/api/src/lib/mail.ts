import { env, usingEmailStub } from "./env.js";

/**
 * Env-gated with a stub fallback: with no RESEND_API_KEY, the OTP is logged
 * to the API console instead of emailed, so local dev and demos never
 * hard-fail on a missing provider key.
 */
export async function sendOtpEmail(email: string, code: string): Promise<void> {
  if (usingEmailStub) {
    console.log(`[mail:stub] OTP for ${email} -> ${code} (valid ${env.OTP_TTL_SECONDS}s)`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Trafy Community <auth@trafy.community>",
      to: email,
      subject: "Your Trafy Community sign-in code",
      text: `Your sign-in code is ${code}. It expires in ${Math.round(env.OTP_TTL_SECONDS / 60)} minutes.`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to send OTP email: ${res.status} ${await res.text()}`);
  }
}
