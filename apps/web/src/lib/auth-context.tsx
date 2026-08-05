"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import posthog from "posthog-js";
import type { AuthUser } from "@trafy-community/core";
import { getStoredSession, storeSession, clearSession } from "./session";
import { trpc } from "./trpc-client";

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  login: (tokens: { accessToken: string; refreshToken: string; user: AuthUser }) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      const current = getStoredSession()?.user ?? null;
      setUser(current);
      // Re-attach the PostHog session to this user on a page reload, not
      // just a fresh interactive login — otherwise every event after a
      // refresh reports as an anonymous visitor.
      if (current) posthog.identify(current.id, { email: current.email });
    };
    sync();
    setReady(true);
    window.addEventListener("trafy-community:session-changed", sync);
    return () => window.removeEventListener("trafy-community:session-changed", sync);
  }, []);

  const login: AuthContextValue["login"] = (tokens) => {
    storeSession(tokens);
    setUser(tokens.user);
    posthog.identify(tokens.user.id, { email: tokens.user.email });
  };

  const logout = async () => {
    const session = getStoredSession();
    if (session) {
      await trpc.auth.logout.mutate({ refreshToken: session.refreshToken }).catch(() => {});
    }
    clearSession();
    setUser(null);
    posthog.capture("user_logged_out");
    posthog.reset();
  };

  return <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
