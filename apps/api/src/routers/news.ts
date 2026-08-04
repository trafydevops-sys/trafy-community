import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../lib/trpc.js";

// Realistic mock data mirroring LinkedIn News
const MOCK_NEWS = [
  { id: "1", title: "UPI transactions hit an all-time high", timeAgo: "21h ago", readers: 914, url: "#" },
  { id: "2", title: "IPO frenzy cools as firms cut deals", timeAgo: "1h ago", readers: 582, url: "#" },
  { id: "3", title: "Food delivery firms chase quick commerce", timeAgo: "1h ago", readers: 320, url: "#" },
  { id: "4", title: "AI problem-solvers top India hiring", timeAgo: "1h ago", readers: 278, url: "#" },
  { id: "5", title: "Global brands find a bright spot in tech", timeAgo: "1h ago", readers: 234, url: "#" }
];

export const newsRouter = router({
  getTopStories: protectedProcedure
    .query(async () => {
      // In the future, we can plug in a real API provider here (e.g., NewsAPI.org)
      // if process.env.NEWS_API_KEY is available. For now, fallback to mocks.
      return MOCK_NEWS;
    }),
});
