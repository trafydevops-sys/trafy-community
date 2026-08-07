"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";

import DashboardIcon from "@mui/icons-material/Dashboard";
import FlagIcon from "@mui/icons-material/Flag";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import GavelIcon from "@mui/icons-material/Gavel";
import HistoryIcon from "@mui/icons-material/History";

const ADMIN_NAV = [
  { label: "Dashboard", href: "/admin", icon: <DashboardIcon /> },
  { label: "Reports", href: "/admin/reports", icon: <FlagIcon /> },
  { label: "Users", href: "/admin/users", icon: <PeopleAltIcon /> },
  { label: "Appeals", href: "/admin/appeals", icon: <GavelIcon /> },
  { label: "Audit log", href: "/admin/audit-log", icon: <HistoryIcon /> },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    // There's no role claim on the access token — admin status lives in
    // profiles.userRole, so every admin procedure re-checks it server-side.
    // Here we just probe with a cheap admin-only query to gate the console.
    withAuthRetry(() => trpc.moderation.getDashboardStats.query())
      .then(() => setAccess("allowed"))
      .catch(() => setAccess("denied"));
  }, []);

  useEffect(() => {
    if (access === "denied") router.replace("/feed");
  }, [access, router]);

  if (access !== "allowed") {
    return (
      <AppShell active="feed">
        <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
          {access === "checking" ? <CircularProgress /> : <Alert severity="error">Admin access required.</Alert>}
        </Box>
      </AppShell>
    );
  }

  return (
    <AppShell active="feed">
      <Container maxWidth="lg" sx={{ pt: 4, pb: 8 }}>
        <Grid container spacing={4}>
          <Grid size={{ xs: 12, md: 3 }}>
            <Paper sx={{ overflow: "hidden", borderRadius: 2 }}>
              <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.default" }}>
                <Typography variant="h6" sx={{ fontWeight: "bold" }}>
                  Admin
                </Typography>
              </Box>
              <List disablePadding>
                {ADMIN_NAV.map((item) => {
                  const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                  return (
                    <ListItem key={item.href} disablePadding>
                      <ListItemButton
                        component={Link}
                        href={item.href}
                        selected={isActive}
                        sx={{
                          py: 1.5,
                          borderLeft: "4px solid",
                          borderColor: isActive ? "primary.main" : "transparent",
                          bgcolor: isActive ? "action.selected" : "transparent",
                          "&.Mui-selected": { bgcolor: "action.selected", "&:hover": { bgcolor: "action.hover" } },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 40, color: isActive ? "primary.main" : "text.secondary" }}>
                          {item.icon}
                        </ListItemIcon>
                        <ListItemText
                          primary={item.label}
                          slotProps={{
                            primary: { sx: { fontWeight: isActive ? "bold" : "medium", color: isActive ? "text.primary" : "text.secondary" } },
                          }}
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, md: 9 }}>{children}</Grid>
        </Grid>
      </Container>
    </AppShell>
  );
}
