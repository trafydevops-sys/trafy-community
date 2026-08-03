"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import { trpc } from "@/lib/trpc-client";
import { useAuth } from "@/lib/auth-context";

function AuthCallbackInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { login } = useAuth();
  
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state"); // "google" or "linkedin"
    const errorParam = searchParams.get("error");
    
    if (errorParam) {
      setError(`Authentication failed: ${errorParam}`);
      return;
    }
    
    if (!code || !state) {
      setError("Missing code or provider state in callback URL.");
      return;
    }
    
    if (handledRef.current) return;
    handledRef.current = true;
    
    async function exchange() {
      try {
        const redirectUri = `${window.location.origin}/auth/callback`;
        const tokens = await trpc.auth.oauthCallback.mutate({
          provider: (state as string) as "google" | "linkedin",
          code: code as string,
          redirectUri,
        });
        
        login(tokens);
        
        const { profile } = await trpc.profile.get.query().catch(() => ({ profile: null }));
        router.push(profile?.fullName ? "/feed" : "/onboarding");
      } catch (err: any) {
        setError(err.message || "Failed to exchange authorization code.");
      }
    }
    
    exchange();
  }, [searchParams, router, login]);

  return (
    <Container maxWidth="sm" sx={{ py: 10, textAlign: "center" }}>
      {error ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
          <Alert severity="error">{error}</Alert>
          <Button variant="outlined" onClick={() => router.push("/sign-in")}>
            Back to Sign In
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
          <CircularProgress />
          <Typography variant="h6">Completing sign in...</Typography>
        </Box>
      )}
    </Container>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <Container maxWidth="sm" sx={{ py: 10, textAlign: "center" }}>
        <CircularProgress />
      </Container>
    }>
      <AuthCallbackInner />
    </Suspense>
  );
}
