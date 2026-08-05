import { describe, expect, it } from "vitest";
import * as OTPAuth from "otpauth";
import {
  buildSetupPayload,
  consumeBackupCode,
  generateBackupCodes,
  generateTotpSecret,
  verifyTotpCode,
} from "../src/lib/totp.js";

describe("TOTP setup + verification", () => {
  it("builds a QR payload whose otpauth URL embeds the account email and issuer", async () => {
    const secret = generateTotpSecret();
    const payload = await buildSetupPayload("dev@example.com", secret);

    expect(payload.otpauthUrl).toContain("dev%40example.com");
    expect(payload.otpauthUrl).toContain("Trafy%20Community");
    expect(payload.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(payload.base32Secret).toBe(secret.base32);
  });

  it("verifies a code generated from the same secret", () => {
    const secret = generateTotpSecret();
    const totp = new OTPAuth.TOTP({ issuer: "Trafy Community", label: "dev@example.com", secret });
    const code = totp.generate();

    expect(verifyTotpCode("dev@example.com", secret.base32, code)).toBe(true);
  });

  it("rejects a code from an unrelated secret", () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const totp = new OTPAuth.TOTP({ issuer: "Trafy Community", label: "dev@example.com", secret: secretB });
    const code = totp.generate();

    expect(verifyTotpCode("dev@example.com", secretA.base32, code)).toBe(false);
  });

  it("rejects a garbage code", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode("dev@example.com", secret.base32, "000000")).toBe(false);
  });
});

describe("backup codes", () => {
  it("generates 8 unique, human-typeable codes whose hashes are what gets stored", () => {
    const { plaintext, hashes } = generateBackupCodes();
    expect(plaintext).toHaveLength(8);
    expect(new Set(plaintext).size).toBe(8);
    for (const code of plaintext) expect(code).toMatch(/^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/);
    expect(hashes).toHaveLength(8);
    expect(hashes.every((h) => !plaintext.includes(h))).toBe(true);
  });

  it("consumes a matching code exactly once, nulling only that slot", () => {
    const { plaintext, hashes } = generateBackupCodes();
    const target = plaintext[3]!;

    const afterFirstUse = consumeBackupCode(hashes, target);
    expect(afterFirstUse).not.toBeNull();
    expect(afterFirstUse![3]).toBeNull();
    expect(afterFirstUse!.filter((h) => h !== null)).toHaveLength(7);

    // Reusing the now-nulled slot fails — this is what "single use" means.
    expect(consumeBackupCode(afterFirstUse!, target)).toBeNull();
  });

  it("is case- and whitespace-insensitive on input", () => {
    const { plaintext, hashes } = generateBackupCodes();
    const messy = ` ${plaintext[0]!.toLowerCase()} `;
    expect(consumeBackupCode(hashes, messy)).not.toBeNull();
  });

  it("rejects a code that was never issued", () => {
    const { hashes } = generateBackupCodes();
    expect(consumeBackupCode(hashes, "ZZZZZ-ZZZZZ")).toBeNull();
  });
});
