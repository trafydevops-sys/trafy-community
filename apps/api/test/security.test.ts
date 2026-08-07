import { describe, expect, it } from "vitest";
import { isOriginAllowed, parseAllowedOrigins } from "../src/lib/security.js";

describe("parseAllowedOrigins", () => {
  it("uses CORS_ORIGINS when set, ignoring WEB_URL", () => {
    const allowed = parseAllowedOrigins("https://app.trafy.com,https://admin.trafy.com", "https://web.trafy.com");
    expect(allowed).toEqual(["https://app.trafy.com", "https://admin.trafy.com"]);
  });

  it("trims whitespace, strips trailing slashes, and dedupes", () => {
    const allowed = parseAllowedOrigins(" https://a.com/ , https://a.com , https://b.com ", "https://web.com");
    expect(allowed).toEqual(["https://a.com", "https://b.com"]);
  });

  it("falls back to WEB_URL alone when CORS_ORIGINS is unset or blank", () => {
    expect(parseAllowedOrigins(undefined, "https://web.trafy.com")).toEqual(["https://web.trafy.com"]);
    expect(parseAllowedOrigins("   ", "https://web.trafy.com")).toEqual(["https://web.trafy.com"]);
  });
});

describe("isOriginAllowed", () => {
  const production = ["https://app.trafy.com"];
  const dev = ["http://localhost:3000"];

  it("allows an exact match", () => {
    expect(isOriginAllowed("https://app.trafy.com", production)).toBe(true);
  });

  it("rejects an origin that is not on the list", () => {
    expect(isOriginAllowed("https://evil.com", production)).toBe(false);
  });

  it("rejects a lookalike subdomain of an allowed host", () => {
    expect(isOriginAllowed("https://app.trafy.com.evil.com", production)).toBe(false);
  });

  it("rejects the same host on a different scheme or port", () => {
    expect(isOriginAllowed("http://app.trafy.com", production)).toBe(false);
    expect(isOriginAllowed("https://app.trafy.com:8443", production)).toBe(false);
  });

  it("allows a missing Origin header — native mobile and server-to-server send none", () => {
    expect(isOriginAllowed(undefined, production)).toBe(true);
  });

  it("allows any loopback port while the allowlist is itself loopback", () => {
    expect(isOriginAllowed("http://localhost:8081", dev)).toBe(true);
    expect(isOriginAllowed("http://127.0.0.1:3000", dev)).toBe(true);
  });

  it("does NOT allow loopback once the allowlist is a real host", () => {
    // The regression that matters: dev convenience must not survive into a
    // production config.
    expect(isOriginAllowed("http://localhost:3000", production)).toBe(false);
  });

  it("ignores a trailing slash on the incoming origin", () => {
    expect(isOriginAllowed("https://app.trafy.com/", production)).toBe(true);
  });

  it("rejects a malformed origin", () => {
    expect(isOriginAllowed("not-a-url", production)).toBe(false);
  });
});
