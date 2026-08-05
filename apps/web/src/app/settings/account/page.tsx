"use client";

import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/lib/auth-context";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ToggleButton from "@mui/material/ToggleButton";
import Avatar from "@mui/material/Avatar";

export default function AccountSettingsPage() {
  const { user } = useAuth();
  const { mode, setMode } = useTheme();

  return (
    <Stack spacing={4}>
      <Paper sx={{ p: 0, borderRadius: 2, overflow: "hidden" }}>
        <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="h6" fontWeight="bold">Profile information</Typography>
          <Typography variant="body2" color="text.secondary">Name, location, and industry.</Typography>
        </Box>
        
        <Box sx={{ p: 3 }}>
          <Stack direction="row" spacing={3} alignItems="center">
            <Avatar sx={{ width: 80, height: 80, bgcolor: "primary.main", fontSize: 32, fontWeight: "bold" }}>
              {user?.email?.charAt(0).toUpperCase()}
            </Avatar>
            <Box>
              <Typography variant="subtitle1" fontWeight="bold">
                {user?.email}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                To change your name or other demographic info, please go to your profile.
              </Typography>
            </Box>
          </Stack>
        </Box>
      </Paper>

      <Paper sx={{ p: 0, borderRadius: 2, overflow: "hidden" }}>
        <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="h6" fontWeight="bold">Display</Typography>
          <Typography variant="body2" color="text.secondary">Choose how your Trafy experience looks for this device.</Typography>
        </Box>
        
        <Box sx={{ p: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 2 }}>Dark mode</Typography>
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(e, newMode) => {
              if (newMode) setMode(newMode);
            }}
            size="small"
            color="primary"
          >
            <ToggleButton value="light" sx={{ px: 3 }}>Light</ToggleButton>
            <ToggleButton value="dark" sx={{ px: 3 }}>Dark</ToggleButton>
            <ToggleButton value="system" sx={{ px: 3 }}>Device setting</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Paper>
    </Stack>
  );
}
