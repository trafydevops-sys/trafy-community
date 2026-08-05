import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "./env.js";

// AES-256-GCM at-rest encryption for small secrets (currently: TOTP seeds).
// Reuses JWT_ACCESS_SECRET as key material via scrypt rather than adding a
// new required env var — it's already a required, rotatable secret nobody
// else derives a key from, so this doesn't weaken it.
const key = scryptSync(env.JWT_ACCESS_SECRET, "trafy-community:totp-secret", 32);

/** Returns `${ivHex}:${authTagHex}:${ciphertextHex}`. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit nonce, standard for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptSecret(encoded: string): string {
  const [ivHex, authTagHex, ciphertextHex] = encoded.split(":");
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error("Malformed encrypted secret");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
