"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Box, Typography, Button, Card, CardContent, CircularProgress, Stack } from "@mui/material";

export default function HomePage() {
  const { user, ready } = useAuth();

  return (
    <Box 
      sx={{ 
        minHeight: "100vh", 
        display: "flex", 
        flexDirection: "column", 
        alignItems: "center", 
        justifyContent: "center",
        p: 3,
        textAlign: "center"
      }}
    >
      <Typography variant="h2" sx={{ fontWeight: 900, letterSpacing: -1, mb: 1, color: "text.primary" }}>
        Trafy
      </Typography>
      <Typography variant="h6" color="text.secondary" sx={{ mb: 6, maxWidth: 600 }}>
        Community-based learning and hiring
      </Typography>

      <Card sx={{ maxWidth: 400, width: "100%", bgcolor: "background.paper", borderRadius: 3, boxShadow: 4 }}>
        <CardContent sx={{ p: 4, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {!ready ? (
            <CircularProgress />
          ) : user ? (
            <Stack spacing={3} sx={{ width: "100%" }}>
              <Typography variant="body1">
                Signed in as <strong>{user.email}</strong>.
              </Typography>
              <Link href="/feed" passHref legacyBehavior>
                <Button variant="contained" color="primary" size="large" fullWidth sx={{ fontWeight: "bold" }}>
                  Go to your feed
                </Button>
              </Link>
            </Stack>
          ) : (
            <Stack spacing={3} sx={{ width: "100%" }}>
              <Typography variant="body1" color="text.secondary">
                Sign up to create your profile, or sign in if you already have an account.
              </Typography>
              <Stack direction="row" spacing={2}>
                <Link href="/sign-up" passHref legacyBehavior style={{ flex: 1 }}>
                  <Button variant="contained" color="primary" fullWidth sx={{ fontWeight: "bold" }}>
                    Sign Up
                  </Button>
                </Link>
                <Link href="/sign-in" passHref legacyBehavior style={{ flex: 1 }}>
                  <Button variant="outlined" color="primary" fullWidth sx={{ fontWeight: "bold" }}>
                    Sign In
                  </Button>
                </Link>
              </Stack>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
