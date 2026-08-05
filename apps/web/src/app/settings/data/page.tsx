"use client";

import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import DownloadIcon from "@mui/icons-material/Download";

export default function DataPrivacySettingsPage() {
  return (
    <Stack spacing={4}>
      <Paper sx={{ p: 0, borderRadius: 2, overflow: "hidden" }}>
        <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="h6" fontWeight="bold">Data privacy</Typography>
          <Typography variant="body2" color="text.secondary">Control your data and privacy settings.</Typography>
        </Box>
        
        <Box sx={{ p: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="subtitle2">Get a copy of your data</Typography>
              <Typography variant="body2" color="text.secondary">
                Download a Zip archive containing your profile, posts, connections, and messages.
              </Typography>
            </Box>
            <Button variant="outlined" startIcon={<DownloadIcon />} disabled>
              Request archive
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Stack>
  );
}
