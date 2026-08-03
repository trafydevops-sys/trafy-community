"use client";

import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import InputBase from "@mui/material/InputBase";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Menu from "@mui/material/Menu";
import Divider from "@mui/material/Divider";
import MenuIcon from "@mui/icons-material/Menu";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import HomeIcon from "@mui/icons-material/Home";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import PeopleIcon from "@mui/icons-material/People";
import WorkOutlinedIcon from "@mui/icons-material/WorkOutlined";
import WorkIcon from "@mui/icons-material/Work";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import SchoolIcon from "@mui/icons-material/School";
import AssignmentTurnedInOutlinedIcon from "@mui/icons-material/AssignmentTurnedInOutlined";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import ChatOutlinedIcon from "@mui/icons-material/ChatOutlined";
import ChatIcon from "@mui/icons-material/Chat";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import NotificationsIcon from "@mui/icons-material/Notifications";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import PersonIcon from "@mui/icons-material/Person";
import SearchIcon from "@mui/icons-material/Search";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";

import { useMediaQuery, useTheme } from "@mui/material";
import { useAuth } from "@/lib/auth-context";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { getSocket } from "@/lib/socket";
import { useThemeMode } from "@/components/theme-registry";

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

type Scope = "people" | "jobs" | "courses";

// 6 Primary Navigation Items requested by user
const PRIMARY_NAV = [
  {
    key: "feed",
    label: "Home",
    subtitle: "Feed & Updates",
    href: "/feed",
    icon: HomeOutlinedIcon,
    activeIcon: HomeIcon,
  },
  {
    key: "network",
    label: "Network",
    subtitle: "Connections & Discovery",
    href: "/network",
    icon: PeopleOutlinedIcon,
    activeIcon: PeopleIcon,
  },
  {
    key: "jobs",
    label: "Jobs",
    subtitle: "Board & Applications",
    href: "/jobs",
    icon: WorkOutlinedIcon,
    activeIcon: WorkIcon,
  },
  {
    key: "learn",
    label: "Learn",
    subtitle: "Courses & Cohorts",
    href: "/learn",
    icon: SchoolOutlinedIcon,
    activeIcon: SchoolIcon,
  },
  {
    key: "assess",
    label: "Assess",
    subtitle: "Tests & Score Card",
    href: "/assess",
    icon: AssignmentTurnedInOutlinedIcon,
    activeIcon: AssignmentTurnedInIcon,
  },
];

const UTILITY_NAV = [
  { key: "chats", label: "Messages", href: "/chats", icon: ChatOutlinedIcon, activeIcon: ChatIcon },
  { key: "notifications", label: "Notifications", href: "/notifications", icon: NotificationsOutlinedIcon, activeIcon: NotificationsIcon },
  { key: "profile", label: "Profile", href: "/profile", icon: PersonOutlinedIcon, activeIcon: PersonIcon },
];

const SECONDARY_NAV = [
  { key: "groups", label: "Groups", href: "/groups", icon: GroupsOutlinedIcon },
  { key: "institutions", label: "Institutions", href: "/institutions", icon: BusinessOutlinedIcon },
  { key: "contracts", label: "Contracts & Escrow", href: "/contracts", icon: HandshakeOutlinedIcon },
];

const SIDEBAR_WIDTH = 280;

function ThemeToggleButton() {
  const { mode, toggleMode } = useThemeMode();
  return (
    <IconButton
      onClick={toggleMode}
      aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      size="small"
    >
      {mode === "dark" ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}
    </IconButton>
  );
}

export function AppShell({ children, active }: { children: ReactNode; active: Tab }) {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingNetwork, setPendingNetwork] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<Scope>("people");
  const [roleMenuAnchor, setRoleMenuAnchor] = useState<null | HTMLElement>(null);
  const isRoleMenuOpen = Boolean(roleMenuAnchor);

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
    if (searchScope === "people") {
      router.push(`/network?q=${q}`);
    } else if (searchScope === "jobs") {
      router.push(`/jobs?q=${q}`);
    } else if (searchScope === "courses") {
      router.push(`/learn?q=${q}`);
    }
  };

  if (!ready || !user) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Typography color="text.secondary">Loading…</Typography>
      </Container>
    );
  }

  function navBadge(tabKey: string) {
    if (tabKey === "notifications" && unreadCount > 0) {
      return <Badge color="error" badgeContent={unreadCount > 9 ? "9+" : unreadCount} sx={{ ml: 1 }} />;
    }
    if (tabKey === "network" && pendingNetwork > 0) {
      return <Badge color="error" badgeContent={pendingNetwork > 9 ? "9+" : pendingNetwork} sx={{ ml: 1 }} />;
    }
    return null;
  }

  const userInitial = user?.email?.charAt(0).toUpperCase() || "U";
  const userDisplayName = user?.email ? user.email.split("@")[0] : "Member";

  const sidebarContent = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", p: 2 }}>
      {/* Brand Logo & Header */}
      <Box sx={{ px: 1, py: 1.5, mb: 1, display: "flex", alignItems: "center", gap: 1 }}>
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: "8px",
            bgcolor: "primary.main",
            color: "primary.contrastText",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "bold",
            fontSize: "1.1rem",
          }}
        >
          T
        </Box>
        <Typography
          variant="h6"
          component={Link}
          href="/feed"
          sx={{ textDecoration: "none", color: "text.primary", fontWeight: 700, letterSpacing: "-0.02em" }}
        >
          Trafy
        </Typography>
      </Box>

      {/* Scoped Search Widget */}
      <Paper
        component="form"
        onSubmit={handleSearchSubmit}
        variant="outlined"
        sx={{
          p: "8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 1,
          mb: 2.5,
          bgcolor: "rgba(255, 255, 255, 0.05)",
          borderRadius: 2.5,
          borderColor: "rgba(255, 255, 255, 0.12)",
          backdropFilter: "blur(12px)",
          transition: "all 0.2s ease",
          "&:focus-within": {
            borderColor: "primary.main",
            boxShadow: "0 0 16px rgba(198, 255, 51, 0.15)",
          },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <SearchIcon sx={{ color: "primary.main", fontSize: 20, mr: 1 }} />
          <InputBase
            inputProps={{ "aria-label": "Search query" }}
            sx={{
              flex: 1,
              fontSize: "0.875rem",
              color: "text.primary",
              "& input::placeholder": {
                color: "text.secondary",
                opacity: 0.8,
              },
            }}
            placeholder={`Search ${searchScope}…`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, pt: 0.75, borderTop: "1px solid", borderColor: "rgba(255, 255, 255, 0.08)" }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, fontWeight: 500 }}>
            Scope:
          </Typography>
          <Select
            value={searchScope}
            onChange={(e) => setSearchScope(e.target.value as Scope)}
            size="small"
            variant="standard"
            disableUnderline
            inputProps={{ "aria-label": "Search scope" }}
            sx={{ fontSize: "0.75rem", fontWeight: 600, color: "primary.main" }}
          >
            <MenuItem value="people" sx={{ fontSize: "0.8rem" }}>People</MenuItem>
            <MenuItem value="jobs" sx={{ fontSize: "0.8rem" }}>Jobs</MenuItem>
            <MenuItem value="courses" sx={{ fontSize: "0.8rem" }}>Courses</MenuItem>
          </Select>
        </Box>
      </Paper>

      {/* Primary Navigation Header */}
      <Typography variant="caption" sx={{ px: 1, color: "text.secondary", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, mb: 0.5 }}>
        Primary Navigation
      </Typography>

      {/* 6 Primary Navigation Items */}
      <List disablePadding sx={{ mb: 2 }}>
        {PRIMARY_NAV.map((item) => {
          const isActive = active === item.key;
          const IconComp = isActive ? item.activeIcon : item.icon;
          return (
            <ListItemButton
              key={item.key}
              component={Link}
              href={item.href}
              selected={isActive}
              onClick={() => isMobile && setDrawerOpen(false)}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                py: 1,
                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                "&.Mui-selected": {
                  bgcolor: "rgba(198, 255, 51, 0.12)",
                  color: "primary.main",
                  fontWeight: 600,
                  boxShadow: "0 0 16px rgba(198, 255, 51, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
                  borderLeft: "3px solid #c6ff33",
                  "& .MuiListItemIcon-root": { color: "primary.main" },
                },
                "&:hover": {
                  bgcolor: "rgba(255, 255, 255, 0.06)",
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: isActive ? "primary.main" : "text.secondary" }}>
                <IconComp fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                secondary={item.subtitle}
                slotProps={{
                  primary: { sx: { fontSize: "0.9rem", fontWeight: isActive ? 600 : 500, fontFamily: "var(--font-outfit)" } },
                  secondary: { sx: { fontSize: "0.725rem", color: "text.secondary" } },
                }}
              />
              {navBadge(item.key)}
            </ListItemButton>
          );
        })}
      </List>

      <Divider sx={{ my: 1 }} />

      {/* Messages · Notifications · Profile Group */}
      <Typography variant="caption" sx={{ px: 1, color: "text.secondary", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, mb: 0.5 }}>
        Activity & Account
      </Typography>
      <List disablePadding sx={{ mb: 2 }}>
        {UTILITY_NAV.map((item) => {
          const isActive = active === item.key;
          const IconComp = isActive ? item.activeIcon : item.icon;
          return (
            <ListItemButton
              key={item.key}
              component={Link}
              href={item.href}
              selected={isActive}
              onClick={() => isMobile && setDrawerOpen(false)}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                py: 0.75,
                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                "&.Mui-selected": {
                  bgcolor: "rgba(198, 255, 51, 0.12)",
                  color: "primary.main",
                  fontWeight: 600,
                  boxShadow: "0 0 16px rgba(198, 255, 51, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
                  borderLeft: "3px solid #c6ff33",
                  "& .MuiListItemIcon-root": { color: "primary.main" },
                },
                "&:hover": {
                  bgcolor: "rgba(255, 255, 255, 0.06)",
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: isActive ? "primary.main" : "text.secondary" }}>
                <IconComp fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                slotProps={{
                  primary: { sx: { fontSize: "0.875rem", fontWeight: isActive ? 600 : 500 } },
                }}
              />
              {navBadge(item.key)}
            </ListItemButton>
          );
        })}
      </List>

      {/* Secondary Features section */}
      <Divider sx={{ my: 1 }} />
      <List disablePadding>
        {SECONDARY_NAV.map((item) => {
          const isActive = active === item.key;
          const IconComp = item.icon;
          return (
            <ListItemButton
              key={item.key}
              component={Link}
              href={item.href}
              selected={isActive}
              onClick={() => isMobile && setDrawerOpen(false)}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                py: 0.75,
              }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: "text.secondary" }}>
                <IconComp fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                slotProps={{
                  primary: { sx: { fontSize: "0.85rem", color: "text.secondary" } },
                }}
              />
            </ListItemButton>
          );
        })}
      </List>

      {/* User Footer Profile Info */}
      <Box
        component="button"
        onClick={(e) => setRoleMenuAnchor(e.currentTarget)}
        aria-controls={isRoleMenuOpen ? "role-menu" : undefined}
        aria-haspopup="true"
        aria-expanded={isRoleMenuOpen ? "true" : undefined}
        aria-label="User account and role menu"
        sx={{
          mt: "auto",
          pt: 2,
          border: "none",
          borderTop: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          background: "none",
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          px: 1,
          "&:hover": { opacity: 0.8 }
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            bgcolor: "rgba(198, 255, 51, 0.15)",
            color: "primary.main",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
            fontSize: "0.9rem",
            border: "1px solid rgba(198, 255, 51, 0.3)",
          }}
        >
          {userInitial}
        </Box>
        <Box sx={{ overflow: "hidden", flex: 1 }}>
          <Typography variant="subtitle2" noWrap sx={{ fontSize: "0.85rem", fontWeight: 600 }}>
            {userDisplayName}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: "0.75rem", display: "block" }}>
            {user.email}
          </Typography>
        </Box>
      </Box>
      <Menu
        id="role-menu"
        anchorEl={roleMenuAnchor}
        open={isRoleMenuOpen}
        onClose={() => setRoleMenuAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <MenuItem onClick={() => setRoleMenuAnchor(null)} disabled>
          <Typography variant="caption" color="text.secondary">Switch Context</Typography>
        </MenuItem>
        <MenuItem onClick={() => { setRoleMenuAnchor(null); router.push("/feed"); }} selected>Talent Dashboard</MenuItem>
        <MenuItem onClick={() => { setRoleMenuAnchor(null); router.push("/jobs"); }}>Recruiter Dashboard</MenuItem>
        <MenuItem onClick={() => { setRoleMenuAnchor(null); router.push("/teach"); }}>Instructor Dashboard</MenuItem>
        <MenuItem onClick={() => { setRoleMenuAnchor(null); router.push("/institutions"); }}>Institution Dashboard</MenuItem>
        <MenuItem onClick={() => { setRoleMenuAnchor(null); router.push("/admin"); }}>Admin Dashboard</MenuItem>
        <Divider />
        <MenuItem onClick={() => { setRoleMenuAnchor(null); router.push("/sign-out"); }}>Sign Out</MenuItem>
      </Menu>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      {/* Mobile Top AppBar */}
      {isMobile && (
        <AppBar position="fixed" color="inherit" sx={{ bgcolor: "background.paper" }}>
          <Toolbar sx={{ gap: 1 }}>
            <IconButton edge="start" aria-label="Open navigation" onClick={() => setDrawerOpen(true)}>
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" component={Link} href="/feed" sx={{ textDecoration: "none", color: "text.primary", flex: 1, fontWeight: 700 }}>
              Trafy
            </Typography>
            {unreadCount > 0 && (
              <IconButton component={Link} href="/notifications" size="small">
                <Badge color="error" badgeContent={unreadCount > 9 ? "9+" : unreadCount}>
                  <NotificationsOutlinedIcon />
                </Badge>
              </IconButton>
            )}
            <ThemeToggleButton />
          </Toolbar>
        </AppBar>
      )}

      {/* Desktop Permanent Left Sidebar */}
      {!isMobile && (
        <Box
          component="nav"
          sx={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            borderRight: "1px solid",
            borderColor: "divider",
            height: "100vh",
            position: "sticky",
            top: 0,
            bgcolor: "background.paper",
            overflowY: "auto",
          }}
        >
          {sidebarContent}
        </Box>
      )}

      {/* Mobile Collapsible Drawer */}
      {isMobile && (
        <Drawer anchor="left" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
          <Box sx={{ width: SIDEBAR_WIDTH, height: "100%", overflowY: "auto" }}>
            {sidebarContent}
          </Box>
        </Drawer>
      )}

      {/* Main Content Column */}
      <Box sx={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Slim Desktop Top Bar — theme toggle only; sidebar keeps logo/search/nav */}
        {!isMobile && (
          <Box
            sx={{
              position: "sticky",
              top: 0,
              zIndex: 1,
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 1,
              px: 3,
              py: 1,
              borderBottom: "1px solid",
              borderColor: "divider",
              bgcolor: "background.paper",
              backdropFilter: "blur(20px)",
            }}
          >
            <ThemeToggleButton />
          </Box>
        )}

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: { xs: 2, md: 4 },
            pt: isMobile ? 8 : 4,
            maxWidth: "100%",
            minWidth: 0,
          }}
        >
          <Container maxWidth="lg" disableGutters sx={{ px: { xs: 0, md: 2 } }}>
            {children}
          </Container>
        </Box>
      </Box>
    </Box>
  );
}


