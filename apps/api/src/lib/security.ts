/**
 * CORS origin allow-listing, shared by the HTTP server and the Socket.IO
 * gateway so both can't drift apart. Both used to be `origin: true`, which
 * reflects whatever Origin the caller sent — i.e. no restriction at all.
 *
 * Pure functions, no module-level state and no env access: callable straight
 * from a unit test with plain strings, same as requireS3Config in storage.ts.
 */

function isLoopback(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function normalize(origin: string): string {
  return origin.trim().replace(/\/$/, "");
}

/**
 * Resolves the allowlist. `CORS_ORIGINS` (comma-separated) wins when set —
 * that's the production path, and it's what a deploy should always set.
 * Unset falls back to WEB_URL alone, so a misconfigured deploy fails closed
 * (only the web app works) rather than open (everyone works).
 */
export function parseAllowedOrigins(raw: string | undefined, webUrl: string): string[] {
  if (raw?.trim()) {
    return [...new Set(raw.split(",").map(normalize).filter(Boolean))];
  }
  return [normalize(webUrl)];
}

/**
 * Dev convenience is deliberately tied to the allowlist itself being loopback:
 * if WEB_URL/CORS_ORIGINS point at a real host we are not in dev, and no
 * localhost origin is accepted. That keeps "any localhost port" from silently
 * remaining true in production, which is how the original `origin: true`
 * survived as long as it did.
 */
export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  // No Origin header: native mobile (React Native/Expo sends none), curl,
  // server-to-server. CORS is a browser-enforced policy — there is no browser
  // here to protect, and rejecting these would break the mobile app outright.
  if (!origin) return true;

  const candidate = normalize(origin);
  if (allowed.includes(candidate)) return true;

  // Expo web and Next.js pick their own ports, and Next binds localhost and
  // 127.0.0.1 interchangeably — matching the host rather than the exact port
  // keeps dev usable without hand-maintaining a list.
  return allowed.some(isLoopback) && isLoopback(candidate);
}

/** Shared rejection, so the HTTP and socket paths fail with the same message.
 *  @fastify/cors and socket.io type their origin callbacks differently, so the
 *  callback itself is built at each call site against that plugin's own types
 *  rather than forced through one signature here. */
export function corsRejection(origin: string | undefined): Error {
  const error = new Error(`Origin ${origin} is not allowed by CORS.`) as Error & { statusCode: number };
  // 403, not Fastify's default 500 for a thrown error. A disallowed Origin is
  // a client problem, and a 5xx would both misreport it and flood Sentry —
  // which captures 5xx — every time a bot probes the API.
  error.statusCode = 403;
  return error;
}
