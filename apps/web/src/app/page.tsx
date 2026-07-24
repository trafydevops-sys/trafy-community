"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function HomePage() {
  const { user, ready } = useAuth();

  return (
    <main className="shell">
      <div className="brand">Trafy Community</div>
      <p className="subtitle">Community-based learning and hiring — Milestone 2: Community shell.</p>

      <div className="card">
        {!ready ? (
          <p className="hint">Loading…</p>
        ) : user ? (
          <>
            <p style={{ marginTop: 0 }}>
              Signed in as <strong>{user.email}</strong>.
            </p>
            <Link href="/feed">
              <button className="primary">Go to your feed</button>
            </Link>
          </>
        ) : (
          <>
            <p style={{ marginTop: 0 }} className="hint">
              Sign up to create your profile, or sign in if you already have an account.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <Link href="/sign-up" style={{ flex: 1 }}>
                <button className="primary">Sign Up</button>
              </Link>
              <Link href="/sign-in" style={{ flex: 1 }}>
                <button className="secondary" style={{ width: "100%" }}>
                  Sign In
                </button>
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
