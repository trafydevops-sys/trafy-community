"use client";

import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";

export default function CommunicationsSettingsPage() {
  return (
    <Stack spacing={4}>
      <Paper sx={{ p: 0, borderRadius: 2, overflow: "hidden" }}>
        <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="h6" sx={{ fontWeight: "bold" }}>Notifications</Typography>
          <Typography variant="body2" color="text.secondary">Choose how and when you want to be notified.</Typography>
        </Box>
        
        <Stack sx={{ p: 1 }} divider={<Box sx={{ borderBottom: "1px solid", borderColor: "divider" }} />}>
          <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box>
              <Typography variant="subtitle2">Push Notifications</Typography>
              <Typography variant="body2" color="text.secondary">Receive notifications on your device</Typography>
            </Box>
            <Switch defaultChecked color="primary" />
          </Box>
          <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box>
              <Typography variant="subtitle2">Email Notifications</Typography>
              <Typography variant="body2" color="text.secondary">Receive daily digests and important updates</Typography>
            </Box>
            <Switch defaultChecked color="primary" />
          </Box>
        </Stack>
      </Paper>
    </Stack>
  );
}
