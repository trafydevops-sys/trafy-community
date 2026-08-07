"use client";

import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import InputBase from "@mui/material/InputBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Divider from "@mui/material/Divider";
import Avatar from "@mui/material/Avatar";

import HomeIcon from "@mui/icons-material/Home";
import PeopleIcon from "@mui/icons-material/People";
import WorkIcon from "@mui/icons-material/Work";
import ChatIcon from "@mui/icons-material/Chat";
import NotificationsIcon from "@mui/icons-material/Notifications";
import SearchIcon from "@mui/icons-material/Search";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import SettingsIcon from "@mui/icons-material/Settings";
import ShieldIcon from "@mui/icons-material/Shield";

import { useAuth } from "@/lib/auth-context";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { getSocket } from "@/lib/socket";

type Tab =
  | "feed"
  | "network"
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

const NAV_ITEMS = [
  { key: "feed", label: "Home", href: "/feed", icon: HomeIcon },
  { key: "network", label: "My Network", href: "/network", icon: PeopleIcon },
  { key: "jobs", label: "Jobs", href: "/jobs", icon: WorkIcon },
  { key: "chats", label: "Messaging", href: "/chats", icon: ChatIcon },
  { key: "notifications", label: "Notifications", href: "/notifications", icon: NotificationsIcon },
];

export function AppShell({ children, active }: { children: ReactNode; active: Tab }) {
  const router = useRouter();
  const { user, ready, logout } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingNetwork, setPendingNetwork] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [profileMenuAnchor, setProfileMenuAnchor] = useState<null | HTMLElement>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/sign-in");
      return;
    }

    withAuthRetry(() => trpc.notifications.list.query({}))
      .then((r) => setUnreadCount(r.unreadCount))
      .catch(() => {});
      
    withAuthRetry(() => trpc.connections.list.query({ status: "pending", direction: "received" }))
      .then((r) => setPendingNetwork(r.length))
      .catch(() => {});

    const socket = getSocket();
    const onNotification = () => setUnreadCount((c) => c + 1);
    socket?.on("notification:new", onNotification);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }

    return () => {
      socket?.off("notification:new", onNotification);
    };
  }, [ready, user, router]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const q = encodeURIComponent(searchQuery.trim());
    router.push(`/network?q=${q}`);
  };

  if (!ready || !user) {
    return null;
  }

  const userInitial = user?.email?.charAt(0).toUpperCase() || "U";

  function renderBadge(key: string, icon: ReactNode) {
    if (key === "notifications" && unreadCount > 0) {
      return <Badge color="error" badgeContent={unreadCount > 9 ? "9+" : unreadCount}>{icon}</Badge>;
    }
    if (key === "network" && pendingNetwork > 0) {
      return <Badge color="error" badgeContent={pendingNetwork > 9 ? "9+" : pendingNetwork}>{icon}</Badge>;
    }
    return icon;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* LinkedIn-style Sticky Top Navbar */}
      <AppBar position="sticky" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ minHeight: "52px !important", display: "flex", gap: 1 }}>
            
            {/* Logo & Search */}
            <Box sx={{ display: "flex", alignItems: "center", flex: 1, gap: 1 }}>
              <Box
                component={Link}
                href="/feed"
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: 1,
                  bgcolor: "primary.main",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 20,
                  textDecoration: "none",
                }}
              >
                T
              </Box>
              
              <Box
                component="form"
                onSubmit={handleSearchSubmit}
                sx={{
                  display: { xs: "none", md: "flex" },
                  alignItems: "center",
                  bgcolor: "#eef3f8",
                  borderRadius: 1,
                  px: 1.5,
                  width: 280,
                  height: 34,
                  transition: "width 0.2s",
                  "&:focus-within": { width: 380, border: "2px solid #0a66c2", bgcolor: "white" }
                }}
              >
                <SearchIcon sx={{ color: "text.secondary", fontSize: 20, mr: 1 }} />
                <InputBase
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  sx={{ flex: 1, fontSize: 14 }}
                />
              </Box>
            </Box>

            {/* Centered Navigation Icons */}
            <Box sx={{ display: "flex", alignItems: "center", height: "100%", gap: { xs: 1, sm: 3 } }}>
              {NAV_ITEMS.map((item) => {
                const isActive = active === item.key;
                return (
                  <Box
                    key={item.key}
                    component={Link}
                    href={item.href}
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      height: 52,
                      minWidth: { xs: 48, sm: 80 },
                      color: isActive ? "text.primary" : "text.secondary",
                      textDecoration: "none",
                      borderBottom: isActive ? "2px solid #0a66c2" : "2px solid transparent",
                      "&:hover": { color: "text.primary" },
                    }}
                  >
                    {renderBadge(item.key, <item.icon sx={{ fontSize: 24, mb: 0.5 }} />)}
                    <Typography sx={{ fontSize: 12, display: { xs: "none", sm: "block" } }}>
                      {item.label}
                    </Typography>
                  </Box>
                );
              })}

              <Divider orientation="vertical" flexItem sx={{ my: 1.5, mx: 1, display: { xs: "none", md: "block" } }} />

              {/* Profile Dropdown */}
              <Box
                onClick={(e) => setProfileMenuAnchor(e.currentTarget)}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 52,
                  minWidth: { xs: 48, sm: 80 },
                  color: "text.secondary",
                  cursor: "pointer",
                  "&:hover": { color: "text.primary" },
                }}
              >
                <Avatar sx={{ width: 24, height: 24, mb: 0.5, bgcolor: "primary.main", fontSize: 12 }}>
                  {userInitial}
                </Avatar>
                <Box sx={{ display: { xs: "none", sm: "flex" }, alignItems: "center" }}>
                  <Typography sx={{ fontSize: 12 }}>Me</Typography>
                  <ArrowDropDownIcon sx={{ fontSize: 16 }} />
                </Box>
              </Box>

              <Menu
                anchorEl={profileMenuAnchor}
                open={Boolean(profileMenuAnchor)}
                onClose={() => setProfileMenuAnchor(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                slotProps={{ paper: { sx: { width: 260, mt: 1, borderRadius: 2, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" } } }}
              >
                <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Avatar sx={{ width: 56, height: 56, bgcolor: "primary.main" }}>{userInitial}</Avatar>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>{user.email}</Typography>
                    <Typography variant="body2" color="text.secondary">Trafy Member</Typography>
                  </Box>
                </Box>
                <Box sx={{ px: 2, pb: 1 }}>
                  <Box
                    component={Link}
                    href="/profile"
                    sx={{
                      display: "block",
                      textAlign: "center",
                      color: "primary.main",
                      border: "1px solid #0a66c2",
                      borderRadius: 4,
                      py: 0.5,
                      textDecoration: "none",
                      fontWeight: 600,
                      "&:hover": { bgcolor: "rgba(10, 102, 194, 0.08)", borderWidth: 2 },
                    }}
                  >
                    View Profile
                  </Box>
                </Box>
                <Divider />
                <MenuItem component={Link} href="/settings" onClick={() => setProfileMenuAnchor(null)}>
                  <SettingsIcon sx={{ mr: 1.5, color: "text.secondary" }} /> Settings & Privacy
                </MenuItem>
                {/* Visible to everyone — /admin's own layout gates on the
                    server-checked admin role and bounces non-admins to /feed. */}
                <MenuItem component={Link} href="/admin" onClick={() => setProfileMenuAnchor(null)}>
                  <ShieldIcon sx={{ mr: 1.5, color: "text.secondary" }} /> Admin console
                </MenuItem>
                <MenuItem onClick={() => { setProfileMenuAnchor(null); logout(); }}>
                  <ExitToAppIcon sx={{ mr: 1.5, color: "text.secondary" }} /> Sign Out
                </MenuItem>
              </Menu>
            </Box>

          </Toolbar>
        </Container>
      </AppBar>

      {/* Main Content Area */}
      <Box component="main" sx={{ flexGrow: 1, bgcolor: "#f3f2ef", py: 4 }}>
        {children}
      </Box>
    </Box>
  );
}
