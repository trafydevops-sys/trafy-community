/**
 * OG tag scraper using Playwright headless Chromium.
 * Falls back to a fast fetch+regex path first (covers most SSR sites).
 * Full headless pass only triggered when the fast path yields no data.
 *
 * Browser singleton is created lazily and kept alive across requests.
 */

import type { Browser } from "playwright";
import type { OgData } from "@trafy-community/core";

let _browser: Browser | null = null;
let _browserStarting = false;

async function getBrowser(): Promise<Browser> {
  if (_browser) return _browser;
  if (_browserStarting) {
    // Poll until ready (handles concurrent first calls)
    await new Promise<void>((resolve) => {
      const t = setInterval(() => {
        if (_browser) { clearInterval(t); resolve(); }
      }, 100);
    });
    return _browser!;
  }

  _browserStarting = true;
  try {
    // Dynamic import so the API doesn't fail at startup if playwright isn't installed
    const { chromium } = await import("playwright");
    _browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    console.info("[og-scraper] Headless Chromium started.");
  } finally {
    _browserStarting = false;
  }
  return _browser!;
}

/** Gracefully shut down the browser on process exit */
process.on("exit", () => { _browser?.close().catch(() => {}); });
process.on("SIGINT", () => { _browser?.close().finally(() => process.exit()); });
process.on("SIGTERM", () => { _browser?.close().finally(() => process.exit()); });

// ──────────────────────────────────────────────────────────────────────────────
// Fast-path: plain fetch for SSR sites (~80% coverage, <200ms)
// ──────────────────────────────────────────────────────────────────────────────

function extractOgFromHtml(html: string): OgData {
  const get = (prop: string) => {
    const m =
      html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, "i")) ??
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, "i"));
    return m?.[1]?.trim() || undefined;
  };
  const title =
    get("title") ??
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();

  return {
    title: title ? decodeHTMLEntities(title) : undefined,
    image: get("image"),
    description: get("description") ? decodeHTMLEntities(get("description")!) : undefined,
    siteName: get("site_name"),
  };
}

function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'");
}

async function fastFetch(url: string): Promise<OgData | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "TrafyBot/1.0 (+https://trafy.community/og-bot)" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const data = extractOgFromHtml(html);
    return data.title ? data : null;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Headless-path: Playwright for JS-rendered / SPA sites
// ──────────────────────────────────────────────────────────────────────────────

async function headlessFetch(url: string): Promise<OgData | null> {
  let browser: Browser;
  try {
    browser = await getBrowser();
  } catch (err) {
    console.warn("[og-scraper] Playwright not available, falling back to empty:", err);
    return null;
  }

  const context = await browser.newContext({ userAgent: "TrafyBot/1.0 (+https://trafy.community/og-bot)" });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10_000 });
    const html = await page.content();
    return extractOgFromHtml(html);
  } catch {
    return null;
  } finally {
    await context.close();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

export async function scrapeOgTags(url: string): Promise<OgData> {
  // 1. Try fast fetch first
  const fast = await fastFetch(url);
  if (fast?.title) return fast;

  // 2. Fall back to headless browser for SPAs
  const headless = await headlessFetch(url);
  return headless ?? {};
}
