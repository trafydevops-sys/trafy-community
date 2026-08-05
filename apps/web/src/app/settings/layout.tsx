"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
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

// Icons
import PersonIcon from "@mui/icons-material/Person";
import LockIcon from "@mui/icons-material/Lock";
import VisibilityIcon from "@mui/icons-material/Visibility";
import NotificationsIcon from "@mui/icons-material/Notifications";
import ShieldIcon from "@mui/icons-material/Shield";

const SETTINGS_NAV = [
  { label: "Account preferences", href: "/settings/account", icon: <PersonIcon /> },
  { label: "Sign in & security", href: "/settings/security", icon: <LockIcon /> },
  { label: "Visibility", href: "/settings/visibility", icon: <VisibilityIcon /> },
  { label: "Communications", href: "/settings/communications", icon: <NotificationsIcon /> },
  { label: "Data privacy", href: "/settings/data", icon: <ShieldIcon /> },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AppShell active="home">
      <Container maxWidth="lg" sx={{ pt: 4, pb: 8 }}>
        <Grid container spacing={4}>
          {/* Left Sidebar */}
          <Grid size={{ xs: 12, md: 3 }}>
            <Paper sx={{ overflow: "hidden", borderRadius: 2 }}>
              <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.default" }}>
                <Typography variant="h6" sx={{ fontWeight: "bold" }}>
                  Settings
                </Typography>
              </Box>
              <List disablePadding>
                {SETTINGS_NAV.map((item) => {
                  const isActive = pathname.startsWith(item.href);
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
                          "&.Mui-selected": {
                            bgcolor: "action.selected",
                            "&:hover": { bgcolor: "action.hover" },
                          },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 40, color: isActive ? "primary.main" : "text.secondary" }}>
                          {item.icon}
                        </ListItemIcon>
                        <ListItemText
                          primary={item.label}
                          slotProps={{
                            primary: {
                              fontWeight: isActive ? "bold" : "medium",
                              color: isActive ? "text.primary" : "text.secondary",
                            },
                          }}
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            </Paper>
          </Grid>

          {/* Main Content */}
          <Grid size={{ xs: 12, md: 9 }}>
            {children}
          </Grid>
        </Grid>
      </Container>
    </AppShell>
  );
}
