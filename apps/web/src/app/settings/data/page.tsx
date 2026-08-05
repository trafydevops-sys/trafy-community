"use client";

import { useState } from "react";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import DownloadIcon from "@mui/icons-material/Download";
import { downloadDataExport } from "@/lib/export";

export default function DataPrivacySettingsPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleRequest() {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await downloadDataExport();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't build your export. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={4}>
      <Paper sx={{ p: 0, borderRadius: 2, overflow: "hidden" }}>
        <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="h6" sx={{ fontWeight: "bold" }}>Data privacy</Typography>
          <Typography variant="body2" color="text.secondary">Control your data and privacy settings.</Typography>
        </Box>

        <Box sx={{ p: 3 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Box>
              <Typography variant="subtitle2">Get a copy of your data</Typography>
              <Typography variant="body2" color="text.secondary">
                Download a zip archive containing your profile, posts, connections, and sent messages.
              </Typography>
            </Box>
            <Button
              variant="outlined"
              startIcon={busy ? <CircularProgress size={16} /> : <DownloadIcon />}
              onClick={handleRequest}
              disabled={busy}
            >
              {busy ? "Preparing…" : "Request archive"}
            </Button>
          </Stack>
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          {done && !error && <Alert severity="success" sx={{ mt: 2 }}>Your archive has started downloading.</Alert>}
        </Box>
      </Paper>
    </Stack>
  );
}
