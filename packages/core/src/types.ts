import { z } from "zod";

/** Skill tracks a talent can be assessed on. */
export const TRACKS = [
  "python",
  "ml-engineering",
  "llm-engineering",
  "data-engineering",
  "frontend",
  "backend",
  "devops",
] as const;
export type Track = (typeof TRACKS)[number];
export const trackSchema = z.enum(TRACKS);

/** A talent's percentile result on one track (0-100). */
export const trackResultSchema = z.object({
  track: trackSchema,
  percentile: z.number().min(0).max(100),
  earnedAt: z.coerce.date(),
});
export type TrackResult = z.infer<typeof trackResultSchema>;
