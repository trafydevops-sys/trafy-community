import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this repo — without it Next.js walks up and
  // finds the sibling trafy/package-lock.json and gets confused about which
  // monorepo it's in (this project is deliberately standalone, see README).
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
};

export default nextConfig;
