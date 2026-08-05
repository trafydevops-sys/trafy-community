import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
// e.g. https://us.i.posthog.com -> https://us-assets.i.posthog.com
const posthogAssetHost = posthogHost.replace(/^https:\/\/(us|eu)\./, "https://$1-assets.");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@trafy-community/core"],
  // Pin the workspace root to this repo — without it Next.js walks up and
  // finds the sibling trafy/package-lock.json and gets confused about which
  // monorepo it's in (this project is deliberately standalone, see README).
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  webpack: (config) => {
    // @trafy-community/core is consumed as raw TS source (its package.json
    // main points at src/index.ts) and follows TypeScript's NodeNext
    // convention of writing `./auth.js` for what is actually `auth.ts`.
    // tsc resolves that; webpack does not, so it must be told the mapping —
    // otherwise any *value* import from the package (as opposed to an erased
    // `import type`) fails with "Can't resolve './auth.js'".
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
  // Proxies PostHog ingestion through this app's own domain so ad blockers
  // don't strip first-party analytics calls (instrumentation-client.ts posts
  // to /ingest, not directly to posthog.com). Harmless no-op traffic-wise
  // when NEXT_PUBLIC_POSTHOG_KEY is unset — nothing ever calls /ingest.
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: `${posthogAssetHost}/static/:path*` },
      { source: "/ingest/:path*", destination: `${posthogHost}/:path*` },
    ];
  },
  skipTrailingSlashRedirect: true,
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Source map upload only runs when this is set — with zero Sentry account
  // configured, withSentryConfig is a harmless passthrough wrapper.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
});
