import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthTokens, AuthUser } from "@trafy-community/core";
import { getStoredSession, storeSession, clearSession } from "./session";
import { trpc } from "./trpc-client";
import { disconnectSocket } from "./socket";

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  // False right after a cold start with an existing session, until the
  // biometric lock screen (or its no-hardware fallback) clears it.
  unlocked: boolean;
  login: (tokens: AuthTokens) => Promise<void>;
  logout: () => Promise<void>;
  markUnlocked: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    (async () => {
      const session = await getStoredSession();
      setUser(session?.user ?? null);
      setReady(true);
    })();
  }, []);

  const login: AuthContextValue["login"] = async (tokens) => {
    await storeSession(tokens);
    setUser(tokens.user);
    // Just authenticated interactively (OTP) — no need to re-gate behind
    // biometrics again in the same launch.
    setUnlocked(true);
  };

  const logout = async () => {
    const session = await getStoredSession();
    if (session) {
      await trpc.auth.logout.mutate({ refreshToken: session.refreshToken }).catch(() => {});
    }
    await clearSession();
    disconnectSocket();
    setUser(null);
    setUnlocked(false);
  };

  const markUnlocked = () => setUnlocked(true);

  return (
    <AuthContext.Provider value={{ user, ready, unlocked, login, logout, markUnlocked }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
