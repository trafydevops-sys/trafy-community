import { eq } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import { db } from "./db.js";

type UserStatusRow = {
  id: string;
  status: string;
  suspendedUntil: Date | null;
};

/**
 * Lazily expires a suspension whose window has passed — called wherever a
 * user's live status matters (auth.me, moderation.myStanding, posts.create).
 * Deliberately does NOT block sign-in: a banned/suspended user can still
 * authenticate and see their own standing/appeal in the app. Blocking
 * sign-in outright would strand them — no way to submit an appeal once
 * their access token expires. Instead, consequential actions (posting,
 * etc.) check status individually and reject with FORBIDDEN.
 */
export async function syncExpiredSuspension(user: UserStatusRow): Promise<UserStatusRow> {
  if (user.status === "suspended" && user.suspendedUntil && user.suspendedUntil.getTime() <= Date.now()) {
    await db
      .update(schema.users)
      .set({ status: "active", suspendedUntil: null, statusReason: null, updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));
    return { ...user, status: "active", suspendedUntil: null };
  }
  return user;
}

/** True if the user is currently allowed to post/apply/message etc. */
export function isAccountRestricted(status: string): boolean {
  return status === "suspended" || status === "banned";
}
