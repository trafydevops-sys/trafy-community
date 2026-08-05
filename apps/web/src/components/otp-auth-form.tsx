"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { TRPCClientError } from "@trpc/client";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import { trpc } from "@/lib/trpc-client";
import { useAuth } from "@/lib/auth-context";

type Step = "email" | "code" | "totp";

export function OtpAuthForm({ heading, subheading }: { heading: string; subheading: string }) {
  const router = useRouter();
  const { login } = useAuth();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [oauthConfig, setOauthConfig] = useState<{ googleClientId: string | null; linkedinClientId: string | null; githubClientId: string | null } | null>(null);

  useEffect(() => {
    trpc.auth.oauthConfig.query().then(setOauthConfig).catch(console.error);
  }, []);

  async function handleRequestOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await trpc.auth.requestOtp.mutate({ email });
      setDevCode(result.devCode ?? null);
      setStep("code");
    } catch (err) {
      setError(err instanceof TRPCClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function afterLogin() {
    const { profile } = await trpc.profile.get.query().catch(() => ({ profile: null }));
    router.push(profile?.fullName ? "/feed" : "/onboarding");
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await trpc.auth.verifyOtp.mutate({ email, code });
      if (result.totpRequired) {
        setChallengeToken(result.challengeToken);
        setStep("totp");
        return;
      }
      login(result);
      await afterLogin();
    } catch (err) {
      setError(err instanceof TRPCClientError ? err.message : "That code is incorrect or has expired.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyTotp(e: FormEvent) {
    e.preventDefault();
    if (!challengeToken) return;
    setError(null);
    setBusy(true);
    try {
      const tokens = await trpc.auth.verifyTotpChallenge.mutate({ challengeToken, code: totpCode });
      login(tokens);
      await afterLogin();
    } catch (err) {
      setError(err instanceof TRPCClientError ? err.message : "That code is incorrect or has expired.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container maxWidth="xs" sx={{ py: { xs: 6, sm: 10 } }}>
      <Typography variant="h4" gutterBottom>
        {heading}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        {subheading}
      </Typography>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          {devCode && (
            <Alert severity="info">
              No email provider configured — your dev code is <strong>{devCode}</strong>
            </Alert>
          )}

          {step === "totp" ? (
            <Stack component="form" onSubmit={handleVerifyTotp} spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Enter the 6-digit code from your authenticator app, or one of your backup codes.
              </Typography>
              <TextField
                id="totp-code"
                label="Authenticator or backup code"
                required
                autoFocus
                fullWidth
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="123456"
              />
              <Button type="submit" variant="contained" size="large" disabled={busy || totpCode.length < 6} fullWidth>
                {busy ? "Verifying…" : "Verify & continue"}
              </Button>
              <Button
                type="button"
                variant="text"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setTotpCode("");
                  setChallengeToken(null);
                  setDevCode(null);
                }}
              >
                Start over
              </Button>
            </Stack>
          ) : step === "email" ? (
            <Stack component="form" onSubmit={handleRequestOtp} spacing={2}>
              {oauthConfig && (oauthConfig.googleClientId || oauthConfig.linkedinClientId || oauthConfig.githubClientId) && (
                <>
                  {oauthConfig.googleClientId && (
                    <Button 
                      variant="outlined" 
                      fullWidth 
                      size="large" 
                      onClick={() => {
                        window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${oauthConfig.googleClientId}&redirect_uri=${window.location.origin}/auth/callback&response_type=code&scope=email%20profile&state=google`;
                      }}
                    >
                      Continue with Google
                    </Button>
                  )}
                  {oauthConfig.linkedinClientId && (
                    <Button 
                      variant="outlined" 
                      fullWidth 
                      size="large" 
                      onClick={() => {
                        window.location.href = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${oauthConfig.linkedinClientId}&redirect_uri=${window.location.origin}/auth/callback&state=linkedin&scope=openid%20profile%20email`;
                      }}
                    >
                      Continue with LinkedIn
                    </Button>
                  )}
                  {oauthConfig.githubClientId && (
                    <Button 
                      variant="outlined" 
                      fullWidth 
                      size="large" 
                      onClick={() => {
                        window.location.href = `https://github.com/login/oauth/authorize?client_id=${oauthConfig.githubClientId}&redirect_uri=${window.location.origin}/auth/callback&scope=user:email&state=github`;
                      }}
                    >
                      Continue with GitHub
                    </Button>
                  )}
                  <Divider sx={{ my: 1, color: "text.secondary", fontSize: "0.875rem" }}>or</Divider>
                </>
              )}

              <TextField
                id="email"
                label="Email"
                type="email"
                required
                autoFocus
                fullWidth
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <Button type="submit" variant="contained" size="large" disabled={busy} fullWidth>
                {busy ? "Sending…" : "Send sign-in code"}
              </Button>
            </Stack>
          ) : (
            <Stack component="form" onSubmit={handleVerifyOtp} spacing={2}>
              <TextField
                id="code"
                label="6-digit code"
                inputMode="numeric"
                slotProps={{ htmlInput: { pattern: "[0-9]{6}", maxLength: 6 } }}
                required
                autoFocus
                fullWidth
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                helperText={`Sent to ${email}.`}
              />
              <Button type="submit" variant="contained" size="large" disabled={busy || code.length !== 6} fullWidth>
                {busy ? "Verifying…" : "Verify & continue"}
              </Button>
              <Button
                type="button"
                variant="text"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setDevCode(null);
                }}
              >
                Use a different email
              </Button>
            </Stack>
          )}
        </Stack>
      </Paper>
    </Container>
  );
}
