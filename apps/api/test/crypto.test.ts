import { describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret } from "../src/lib/crypto.js";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a plaintext secret", () => {
    const plaintext = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptSecret(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("never stores the plaintext inside the ciphertext blob", () => {
    const plaintext = "JBSWY3DPEHPK3PXP";
    expect(encryptSecret(plaintext)).not.toContain(plaintext);
  });

  it("produces a different ciphertext each call (random IV) for the same input", () => {
    const plaintext = "JBSWY3DPEHPK3PXP";
    expect(encryptSecret(plaintext)).not.toBe(encryptSecret(plaintext));
  });

  it("rejects a tampered ciphertext instead of silently returning garbage", () => {
    const encrypted = encryptSecret("JBSWY3DPEHPK3PXP");
    const [iv, tag, cipher] = encrypted.split(":");
    // Flip a hex character in the ciphertext body.
    const tampered = `${iv}:${tag}:${cipher!.slice(0, -1)}${cipher!.at(-1) === "0" ? "1" : "0"}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rejects a malformed blob", () => {
    expect(() => decryptSecret("not-a-valid-blob")).toThrow(/Malformed/);
  });
});
