import { eq } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import type { NotificationType } from "@trafy-community/core";
import { db } from "./db.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function money(cents: unknown): string {
  const value = typeof cents === "number" ? cents : 0;
  return `$${(value / 100).toFixed(2)}`;
}

function str(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

/** Short title/body pair for a push banner — deliberately terser than the
 * in-app notification list's descriptions (web's notifications page
 * `describe()`), since push banners have limited space. */
function pushCopy(type: NotificationType, payload: Record<string, unknown>): { title: string; body: string } {
  const actor = str(payload, "actorName") || "Someone";
  switch (type) {
    case "new_follower":
      return { title: "New follower", body: `${actor} started following you.` };
    case "post_reaction":
      return { title: "New like", body: `${actor} liked your post.` };
    case "chat_message":
      return { title: actor, body: "Sent you a message." };
    case "course_sale":
      return { title: "Course sale", body: `${actor} bought "${str(payload, "courseTitle")}" for ${money(payload.amountCents)}.` };
    case "job_application":
      return { title: "New application", body: `${actor} applied to "${str(payload, "jobTitle")}".` };
    case "application_status_changed":
      return { title: "Application update", body: `Your application to "${str(payload, "jobTitle")}" moved to ${str(payload, "status")}.` };
    case "contract_created":
      return { title: "Contract created", body: `${actor} created a contract for "${str(payload, "jobTitle")}".` };
    case "milestone_funded":
      return { title: "Milestone funded", body: `${actor} funded "${str(payload, "milestoneTitle")}" (${money(payload.amountCents)}).` };
    case "milestone_released":
      return { title: "Milestone released", body: `${actor} released "${str(payload, "milestoneTitle")}" (${money(payload.amountCents)}) to you.` };
    case "org_invite":
      return { title: "Organization invite", body: `${actor} added you to ${str(payload, "organizationName")} as ${str(payload, "role")}.` };
    default:
      return { title: "Trafy Community", body: "You have a new notification." };
  }
}

type ExpoTicket = { status: "ok" | "error"; details?: { error?: string } };

/**
 * Best-effort push delivery to every device the user has registered
 * (push.registerToken). Never throws — a failed/partial push send must
 * never break the notify() call site (chat sends, reactions, etc. don't
 * await this and don't care if it fails).
 *
 * Expo's push service needs no API key, but a token whose owning
 * installation is gone answers with `DeviceNotRegistered` — we delete those
 * rows so we stop trying to reach a dead device.
 */
export async function sendPushForNotification(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const tokens = await db.select().from(schema.pushTokens).where(eq(schema.pushTokens.userId, userId));
    if (tokens.length === 0) return;

    const { title, body } = pushCopy(type, payload);
    const messages = tokens.map((t) => ({
      to: t.token,
      title,
      body,
      data: { type, ...payload },
    }));

    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
    if (!res.ok) return;

    const json = (await res.json()) as { data?: ExpoTicket[] };
    const tickets = json.data;
    if (!tickets) return;

    await Promise.all(
      tickets.map(async (ticket, i) => {
        if (ticket.status !== "error" || ticket.details?.error !== "DeviceNotRegistered") return;
        const deadToken = tokens[i]?.token;
        if (deadToken) await db.delete(schema.pushTokens).where(eq(schema.pushTokens.token, deadToken));
      })
    );
  } catch {
    // Network/Expo-service hiccups are never fatal to the caller.
  }
}
