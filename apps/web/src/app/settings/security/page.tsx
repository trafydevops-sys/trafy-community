"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { TRPCClientError } from "@trpc/client";
import { useAuth } from "@/lib/auth-context";
import { trpc, withAuthRetry } from "@/lib/trpc-client";
import { getStoredSession } from "@/lib/session";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import type { MyStanding } from "@trafy-community/core";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof TRPCClientError ? err.message : fallback;
}

// --- Account standing / appeal --------------------------------------------

function AccountStandingCard() {
  const [standing, setStanding] = useState<MyStanding | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  function refresh() {
    withAuthRetry(() => trpc.moderation.myStanding.query())
      .then(setStanding)
      .catch(() => setStanding(null));
  }

  useEffect(refresh, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await withAuthRetry(() => trpc.moderation.submitAppeal.mutate({ reason }));
      setSubmitted(true);
      setDialogOpen(false);
      refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't submit your appeal."));
    } finally {
      setBusy(false);
    }
  }

  if (!standing || standing.status === "active") return null;

  return (
    <Paper sx={{ p: 0, borderRadius: 2, overflow: "hidden", border: "1px solid", borderColor: "error.main" }}>
      <Box sx={{ p: 3 }}>
        <Alert severity={standing.status === "banned" ? "error" : "warning"} sx={{ mb: 2 }}>
          Your account is {standing.status}
          {standing.suspendedUntil ? ` until ${new Date(standing.suspendedUntil).toLocaleDateString()}` : ""}.
          {standing.statusReason ? ` Reason: ${standing.statusReason}` : ""}
        </Alert>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          You can still browse, but posting and other actions are restricted while this is in effect.
        </Typography>
        {submitted || standing.hasPendingAppeal ? (
          <Chip label="Appeal submitted — under review" color="info" size="small" />
        ) : (
          <Button variant="contained" size="small" onClick={() => setDialogOpen(true)}>
            Appeal this decision
          </Button>
        )}
      </Box>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Appeal your {standing.status}</DialogTitle>
        <Box component="form" onSubmit={handleSubmit}>
          <DialogContent>
            <Stack spacing={2}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField
                label="Why should this be reconsidered?"
                multiline
                rows={4}
                required
                autoFocus
                fullWidth
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={busy || !reason.trim()}>
              {busy ? "Submitting…" : "Submit appeal"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Paper>
  );
}

// --- Change email ------------------------------------------------------

function ChangeEmailDialog({ open, currentEmail, onClose, onChanged }: {
  open: boolean;
  currentEmail: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { login } = useAuth();
  const [step, setStep] = useState<"email" | "code">("email");
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setStep("email");
    setNewEmail("");
    setCode("");
    setDevCode(null);
    setError(null);
    setBusy(false);
  }

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await withAuthRetry(() => trpc.auth.requestEmailChange.mutate({ newEmail }));
      setDevCode(result.devCode ?? null);
      setStep("code");
    } catch (err) {
      setError(errorMessage(err, "Couldn't send a code to that address."));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const tokens = await withAuthRetry(() => trpc.auth.confirmEmailChange.mutate({ newEmail, code }));
      login(tokens);
      onChanged();
      reset();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "That code is incorrect or has expired."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose(); }} maxWidth="xs" fullWidth>
      <DialogTitle>Change email</DialogTitle>
      {step === "email" ? (
        <Box component="form" onSubmit={handleRequest}>
          <DialogContent>
            <Stack spacing={2}>
              {error && <Alert severity="error">{error}</Alert>}
              <Typography variant="body2" color="text.secondary">
                Currently <strong>{currentEmail}</strong>. We'll send a code to your new address to confirm you own it.
              </Typography>
              <TextField
                label="New email"
                type="email"
                required
                autoFocus
                fullWidth
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={busy || !newEmail}>
              {busy ? "Sending…" : "Send code"}
            </Button>
          </DialogActions>
        </Box>
      ) : (
        <Box component="form" onSubmit={handleConfirm}>
          <DialogContent>
            <Stack spacing={2}>
              {error && <Alert severity="error">{error}</Alert>}
              {devCode && (
                <Alert severity="info">No email provider configured — your dev code is <strong>{devCode}</strong></Alert>
              )}
              <TextField
                label="6-digit code"
                inputMode="numeric"
                slotProps={{ htmlInput: { pattern: "[0-9]{6}", maxLength: 6 } }}
                required
                autoFocus
                fullWidth
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                helperText={`Sent to ${newEmail}.`}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setStep("email")}>Back</Button>
            <Button type="submit" variant="contained" disabled={busy || code.length !== 6}>
              {busy ? "Confirming…" : "Confirm change"}
            </Button>
          </DialogActions>
        </Box>
      )}
    </Dialog>
  );
}

// --- Two-step verification ----------------------------------------------

function TotpSetupDialog({ open, onClose, onEnabled }: {
  open: boolean;
  onClose: () => void;
  onEnabled: () => void;
}) {
  const [phase, setPhase] = useState<"loading" | "scan" | "backup-codes" | "error">("loading");
  const [setup, setSetup] = useState<{ base32Secret: string; otpauthUrl: string; qrCodeDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhase("loading");
    setCode("");
    setError(null);
    withAuthRetry(() => trpc.auth.totpSetupBegin.mutate())
      .then((result) => {
        setSetup(result);
        setPhase("scan");
      })
      .catch((err) => {
        setError(errorMessage(err, "Couldn't start setup."));
        setPhase("error");
      });
  }, [open]);

  async function handleConfirm(e: FormEvent) {
    e.preventDefault();
    if (!setup) return;
    setError(null);
    setBusy(true);
    try {
      const result = await withAuthRetry(() =>
        trpc.auth.totpSetupConfirm.mutate({ base32Secret: setup.base32Secret, code })
      );
      setBackupCodes(result.backupCodes);
      setPhase("backup-codes");
    } catch (err) {
      setError(errorMessage(err, "That code is incorrect."));
    } finally {
      setBusy(false);
    }
  }

  function handleDownloadCodes() {
    const blob = new Blob(
      [`Trafy Community — two-step verification backup codes\nGenerated ${new Date().toISOString()}\n\n${backupCodes.join("\n")}\n\nEach code works once. Keep them somewhere safe — anyone with a code can sign in as you.\n`],
      { type: "text/plain" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trafy-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDone() {
    onEnabled();
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Turn on two-step verification</DialogTitle>
      {phase === "loading" && (
        <DialogContent sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </DialogContent>
      )}
      {phase === "error" && (
        <>
          <DialogContent><Alert severity="error">{error}</Alert></DialogContent>
          <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
        </>
      )}
      {phase === "scan" && setup && (
        <Box component="form" onSubmit={handleConfirm}>
          <DialogContent>
            <Stack spacing={2}>
              {error && <Alert severity="error">{error}</Alert>}
              <Typography variant="body2" color="text.secondary">
                Scan this with an authenticator app (Google Authenticator, Authy, 1Password, ...).
              </Typography>
              <Box sx={{ display: "flex", justifyContent: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- data: URI, no next/image loader involved */}
                <img src={setup.qrCodeDataUrl} alt="Scan with your authenticator app" width={200} height={200} />
              </Box>
              <Typography variant="caption" color="text.secondary">
                Can't scan it? Enter this key manually:
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontFamily: "monospace", wordBreak: "break-all", bgcolor: "action.hover", p: 1, borderRadius: 1 }}
              >
                {setup.base32Secret}
              </Typography>
              <TextField
                label="6-digit code from your app"
                inputMode="numeric"
                slotProps={{ htmlInput: { pattern: "[0-9]{6}", maxLength: 6 } }}
                required
                autoFocus
                fullWidth
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={busy || code.length !== 6}>
              {busy ? "Verifying…" : "Verify & turn on"}
            </Button>
          </DialogActions>
        </Box>
      )}
      {phase === "backup-codes" && (
        <>
          <DialogContent>
            <Stack spacing={2}>
              <Alert severity="success">Two-step verification is on.</Alert>
              <Typography variant="body2">
                Save these backup codes somewhere safe. Each works once, and lets you in if you lose access to your
                authenticator app. They won't be shown again.
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 1,
                  bgcolor: "action.hover",
                  borderRadius: 1,
                  p: 2,
                  fontFamily: "monospace",
                }}
              >
                {backupCodes.map((c) => (
                  <Typography key={c} variant="body2" sx={{ fontFamily: "monospace" }}>{c}</Typography>
                ))}
              </Box>
              <Button variant="outlined" onClick={handleDownloadCodes}>Download codes as .txt</Button>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button variant="contained" onClick={handleDone}>I've saved these codes</Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

function TotpDisableDialog({ open, onClose, onDisabled }: {
  open: boolean;
  onClose: () => void;
  onDisabled: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await withAuthRetry(() => trpc.auth.totpDisable.mutate({ code }));
      setCode("");
      onDisabled();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "That code is incorrect."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Turn off two-step verification</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <Typography variant="body2" color="text.secondary">
              Enter a code from your authenticator app, or a backup code, to confirm.
            </Typography>
            <TextField
              label="Authenticator or backup code"
              required
              autoFocus
              fullWidth
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" color="error" variant="contained" disabled={busy || code.length < 6}>
            {busy ? "Turning off…" : "Turn off"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

// --- Page -----------------------------------------------------------------

export default function SecuritySettingsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null);
  const [dialog, setDialog] = useState<"email" | "totp-setup" | "totp-disable" | "signout" | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [signOutBusy, setSignOutBusy] = useState(false);

  function refreshMe() {
    withAuthRetry(() => trpc.auth.me.query())
      .then((me) => setTotpEnabled(me.totpEnabled))
      .catch(() => setTotpEnabled(null));
  }

  useEffect(refreshMe, []);

  async function handleSignOutAll() {
    setSignOutError(null);
    setSignOutBusy(true);
    try {
      await withAuthRetry(() => trpc.auth.revokeAllSessions.mutate());
      // Our own refresh token was just revoked too — mirror that locally
      // rather than let the next api call surface a confusing 401.
      const session = getStoredSession();
      if (session) {
        await trpc.auth.logout.mutate({ refreshToken: session.refreshToken }).catch(() => {});
      }
      window.localStorage.removeItem("trafy-community.session");
      window.dispatchEvent(new Event("trafy-community:session-changed"));
      router.push("/sign-in");
    } catch (err) {
      setSignOutError(errorMessage(err, "Couldn't sign out of your sessions. Try again."));
      setSignOutBusy(false);
    }
  }

  return (
    <Stack spacing={4}>
      <AccountStandingCard />

      <Paper sx={{ p: 0, borderRadius: 2, overflow: "hidden" }}>
        <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="h6" sx={{ fontWeight: "bold" }}>Account access</Typography>
          <Typography variant="body2" color="text.secondary">Settings to help you keep your account secure.</Typography>
        </Box>

        <Stack sx={{ p: 1 }} divider={<Box sx={{ borderBottom: "1px solid", borderColor: "divider" }} />}>
          <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box>
              <Typography variant="subtitle2">Email addresses</Typography>
              <Typography variant="body2" color="text.secondary">{user?.email}</Typography>
            </Box>
            <Button size="small" variant="outlined" onClick={() => setDialog("email")}>Change</Button>
          </Box>
          <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Typography variant="subtitle2">Two-step verification</Typography>
                {totpEnabled && <Chip label="On" color="success" size="small" />}
              </Stack>
              <Typography variant="body2" color="text.secondary">Add an extra layer of security</Typography>
            </Box>
            {totpEnabled === null ? (
              <CircularProgress size={20} />
            ) : totpEnabled ? (
              <Button size="small" variant="outlined" color="error" onClick={() => setDialog("totp-disable")}>
                Turn off
              </Button>
            ) : (
              <Button size="small" variant="outlined" onClick={() => setDialog("totp-setup")}>Turn on</Button>
            )}
          </Box>
        </Stack>
      </Paper>

      <Paper sx={{ p: 0, borderRadius: 2, overflow: "hidden" }}>
        <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="h6" sx={{ fontWeight: "bold" }}>Active sessions</Typography>
          <Typography variant="body2" color="text.secondary">See when and where you're logged in.</Typography>
        </Box>

        <Box sx={{ p: 3 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <VerifiedUserIcon color="success" fontSize="large" />
            <Box>
              <Typography variant="subtitle2">Current session</Typography>
              <Typography variant="body2" color="text.secondary">
                You are currently logged into this device.
              </Typography>
            </Box>
          </Stack>

          {signOutError && <Alert severity="error" sx={{ mt: 2 }}>{signOutError}</Alert>}

          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 3, mb: 1 }}>
            This revokes every device's session, including this one — you'll need to sign in again here too.
          </Typography>
          <Button variant="contained" color="error" onClick={() => setDialog("signout")} disabled={signOutBusy}>
            Sign out of all sessions
          </Button>
        </Box>
      </Paper>

      <ChangeEmailDialog open={dialog === "email"} currentEmail={user?.email ?? ""} onClose={() => setDialog(null)} onChanged={refreshMe} />
      <TotpSetupDialog open={dialog === "totp-setup"} onClose={() => setDialog(null)} onEnabled={refreshMe} />
      <TotpDisableDialog open={dialog === "totp-disable"} onClose={() => setDialog(null)} onDisabled={refreshMe} />

      <Dialog open={dialog === "signout"} onClose={() => setDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Sign out of all sessions?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            You'll be signed out on every device, including this one, and need to sign in again everywhere.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={signOutBusy} onClick={handleSignOutAll}>
            {signOutBusy ? "Signing out…" : "Sign out everywhere"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
