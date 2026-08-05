"use client";

import { useAuth } from "@/lib/auth-context";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";

export default function SecuritySettingsPage() {
  const { user } = useAuth();

  return (
    <Stack spacing={4}>
      <Paper sx={{ p: 0, borderRadius: 2, overflow: "hidden" }}>
        <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="h6" fontWeight="bold">Account access</Typography>
          <Typography variant="body2" color="text.secondary">Settings to help you keep your account secure.</Typography>
        </Box>
        
        <Stack sx={{ p: 1 }} divider={<Box sx={{ borderBottom: "1px solid", borderColor: "divider" }} />}>
          <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box>
              <Typography variant="subtitle2">Email addresses</Typography>
              <Typography variant="body2" color="text.secondary">{user?.email}</Typography>
            </Box>
            <Button size="small" variant="outlined" disabled>Change</Button>
          </Box>
          <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box>
              <Typography variant="subtitle2">Two-step verification</Typography>
              <Typography variant="body2" color="text.secondary">Add an extra layer of security</Typography>
            </Box>
            <Button size="small" variant="outlined" disabled>Turn on</Button>
          </Box>
        </Stack>
      </Paper>

      <Paper sx={{ p: 0, borderRadius: 2, overflow: "hidden" }}>
        <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="h6" fontWeight="bold">Active sessions</Typography>
          <Typography variant="body2" color="text.secondary">See when and where you're logged in.</Typography>
        </Box>
        
        <Box sx={{ p: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <VerifiedUserIcon color="success" fontSize="large" />
            <Box>
              <Typography variant="subtitle2">Current session</Typography>
              <Typography variant="body2" color="text.secondary">
                You are currently logged into this device.
              </Typography>
            </Box>
          </Stack>
          
          <Button variant="contained" color="error" sx={{ mt: 3 }} onClick={() => {
            // Future implementation: Hit an endpoint to revoke all refreshTokens
            alert("Sign out of all other sessions feature coming soon!");
          }}>
            Sign out of all sessions
          </Button>
        </Box>
      </Paper>
    </Stack>
  );
}
