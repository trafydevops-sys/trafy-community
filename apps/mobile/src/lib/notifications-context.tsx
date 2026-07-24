import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { trpc } from "./trpc-client";
import { getSocket } from "./socket";

type UnreadContextValue = {
  unreadCount: number;
  setUnreadCount: (updater: number | ((count: number) => number)) => void;
};

const UnreadContext = createContext<UnreadContextValue | null>(null);

/**
 * Shared unread-notification count for the tab bar badge and the
 * Notifications screen. Unlike the web app's app-shell (which only ever
 * increments the badge and never reconciles it with markRead/markAllRead —
 * see Milestone 8 research notes), this decrements on read so the badge
 * stays accurate.
 */
export function UnreadNotificationsProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCountState] = useState(0);

  useEffect(() => {
    trpc.notifications.list
      .query({})
      .then((r) => setUnreadCountState(r.unreadCount))
      .catch(() => {});

    let unsubscribe: (() => void) | undefined;
    getSocket().then((socket) => {
      if (!socket) return;
      const onNotification = () => setUnreadCountState((c) => c + 1);
      socket.on("notification:new", onNotification);
      unsubscribe = () => socket.off("notification:new", onNotification);
    });

    return () => unsubscribe?.();
  }, []);

  function setUnreadCount(updater: number | ((count: number) => number)) {
    setUnreadCountState((c) => (typeof updater === "function" ? (updater as (count: number) => number)(c) : updater));
  }

  return <UnreadContext.Provider value={{ unreadCount, setUnreadCount }}>{children}</UnreadContext.Provider>;
}

export function useUnreadNotifications(): UnreadContextValue {
  const ctx = useContext(UnreadContext);
  if (!ctx) throw new Error("useUnreadNotifications must be used within <UnreadNotificationsProvider>");
  return ctx;
}
