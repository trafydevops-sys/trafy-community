"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import MenuIcon from "@mui/icons-material/Menu";
import { useMediaQuery, useTheme } from "@mui/material";
import { useAuth } from "@/lib/auth-context";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { getSocket } from "@/lib/socket";

type Tab =
  | "feed"
  | "discover"
  | "chats"
  | "notifications"
  | "learn"
  | "teach"
  | "institutions"
  | "groups"
  | "assess"
  | "jobs"
  | "hire"
  | "contracts"
  | "profile";

const TABS: { key: Tab; label: string; href: string }[] = [
  { key: "feed", label: "Feed", href: "/feed" },
  { key: "discover", label: "Discover", href: "/discover" },
  { key: "chats", label: "Chats", href: "/chats" },
  { key: "groups", label: "Groups", href: "/groups" },
  { key: "assess", label: "Assess", href: "/assess" },
  { key: "learn", label: "Learn", href: "/learn" },
  { key: "teach", label: "Teach", href: "/teach" },
  { key: "institutions", label: "Institutions", href: "/institutions" },
  { key: "jobs", label: "Jobs", href: "/jobs" },
  { key: "hire", label: "Hire", href: "/hire" },
  { key: "contracts", label: "Contracts", href: "/contracts" },
  { key: "notifications", label: "Notifications", href: "/notifications" },
  { key: "profile", label: "Profile", href: "/profile" },
];

export function AppShell({ children, active }: { children: ReactNode; active: Tab }) {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/sign-in");
      return;
    }

    withAuthRetry(() => trpc.notifications.list.query({}))
      .then((r) => setUnreadCount(r.unreadCount))
      .catch(() => {});

    const socket = getSocket();
    const onNotification = () => setUnreadCount((c) => c + 1);
    socket?.on("notification:new", onNotification);
    return () => {
      socket?.off("notification:new", onNotification);
    };
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Typography color="text.secondary">Loading…</Typography>
      </Container>
    );
  }

  function navBadge(tab: Tab) {
    if (tab !== "notifications" || unreadCount === 0) return null;
    return <Badge color="error" badgeContent={unreadCount > 9 ? "9+" : unreadCount} sx={{ ml: 1.5 }} />;
  }

  return (
    <Box>
      <AppBar position="sticky" color="inherit" sx={{ bgcolor: "background.paper" }}>
        <Toolbar sx={{ gap: 1 }}>
          {isMobile && (
            <IconButton edge="start" aria-label="Open navigation" onClick={() => setDrawerOpen(true)}>
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" component={Link} href="/feed" sx={{ textDecoration: "none", color: "text.primary", mr: 2 }}>
            Trafy Community
          </Typography>

          {!isMobile && (
            <Tabs
              value={TABS.some((t) => t.key === active) ? active : false}
              variant="scrollable"
              scrollButtons="auto"
              sx={{ flex: 1, minHeight: 0 }}
              slotProps={{ indicator: { sx: { bgcolor: "primary.main" } } }}
            >
              {TABS.map((tab) => (
                <Tab
                  key={tab.key}
                  value={tab.key}
                  label={
                    <Box sx={{ display: "flex", alignItems: "center" }}>
                      {tab.label}
                      {navBadge(tab.key)}
                    </Box>
                  }
                  component={Link}
                  href={tab.href}
                  sx={{ minHeight: 48, textTransform: "none" }}
                />
              ))}
            </Tabs>
          )}
        </Toolbar>
      </AppBar>

      <Drawer anchor="left" open={isMobile && drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 260 }} role="presentation" onClick={() => setDrawerOpen(false)}>
          <List>
            {TABS.map((tab) => (
              <ListItemButton key={tab.key} component={Link} href={tab.href} selected={tab.key === active}>
                <ListItemText primary={tab.label} />
                {navBadge(tab.key)}
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>

      {/* `.shell.wide` (globals.css) is kept here so pages not yet migrated to
          MUI components (see README's design-system migration plan) keep
          their existing max-width/padding — remove once all pages are ported. */}
      <div className="shell wide">{children}</div>
    </Box>
  );
}
