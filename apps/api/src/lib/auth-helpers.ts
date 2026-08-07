import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import { db } from "./db.js";

/** Platform-wide admin — driven by profiles.userRole, same flag analytics.ts checks. */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1);
  return profile?.userRole === "admin";
}

/** Throws FORBIDDEN unless the calling user is a platform admin. */
export async function requireAdmin(userId: string): Promise<void> {
  if (!(await isPlatformAdmin(userId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
  }
}
