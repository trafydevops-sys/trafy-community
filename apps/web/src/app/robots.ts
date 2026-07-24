import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Authenticated app screens have nothing indexable behind them —
        // only the public marketing/entry points are worth crawling.
        disallow: ["/feed", "/discover", "/chats", "/notifications", "/profile", "/contracts", "/onboarding"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
