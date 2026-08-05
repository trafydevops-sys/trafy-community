import { createHash, randomBytes } from "node:crypto";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

const ISSUER = "Trafy Community";
const BACKUP_CODE_COUNT = 8;

export function generateTotpSecret(): OTPAuth.Secret {
  return new OTPAuth.Secret({ size: 20 });
}

function totpFor(email: string, secret: OTPAuth.Secret | string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
}

export async function buildSetupPayload(
  email: string,
  secret: OTPAuth.Secret
): Promise<{ base32Secret: string; otpauthUrl: string; qrCodeDataUrl: string }> {
  const totp = totpFor(email, secret);
  const otpauthUrl = totp.toString();
  return {
    base32Secret: secret.base32,
    otpauthUrl,
    qrCodeDataUrl: await QRCode.toDataURL(otpauthUrl),
  };
}

/** Accepts a code up to 1 step (30s) early/late to absorb clock drift. */
export function verifyTotpCode(email: string, base32Secret: string, code: string): boolean {
  const totp = totpFor(email, base32Secret);
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

function hashBackupCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Human-typeable: 10 chars, groups of 5, from an unambiguous alphabet
 *  (no 0/O/1/I/L). Returns both the plaintext (show once) and its hash
 *  (persist). */
export function generateBackupCodes(): { plaintext: string[]; hashes: string[] } {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const plaintext: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const bytes = randomBytes(10);
    let raw = "";
    for (const b of bytes) raw += alphabet[b % alphabet.length];
    plaintext.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return { plaintext, hashes: plaintext.map(hashBackupCode) };
}

/**
 * Checks `code` against the stored hash list and, on a match, returns the
 * updated list with that slot nulled out (single use). Returns null on no
 * match — callers should treat that as "not a valid backup code" and fall
 * through to trying it as a TOTP code instead.
 */
export function consumeBackupCode(
  hashes: (string | null)[],
  code: string
): (string | null)[] | null {
  const normalized = code.trim().toUpperCase();
  const target = hashBackupCode(normalized);
  const index = hashes.findIndex((h) => h === target);
  if (index === -1) return null;
  const next = [...hashes];
  next[index] = null;
  return next;
}
