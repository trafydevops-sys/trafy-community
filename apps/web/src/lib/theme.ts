import { createTheme, type PaletteMode } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface Palette {
    accent: {
      lime: string;
      blue: string;
      green: string;
      amber: string;
      purple: string;
    };
  }
  interface PaletteOptions {
    accent?: {
      lime: string;
      blue: string;
      green: string;
      amber: string;
      purple: string;
    };
  }
}

// Same brand hues in both modes (lime CTA, cyber blue, etc.) — only surface
// luminance, text color, and glow/shadow intensity change between light and
// dark. `--accent-blue` and danger red are the exceptions: used as literal
// text color in globals.css, so they need darker variants in light mode to
// keep AA contrast against a light background.
const SURFACES = {
  dark: {
    default: "#070a11", // Deep Obsidian Background
    paper: "rgba(15, 22, 37, 0.75)", // Frosted Glass Paper Surface
    textPrimary: "#f8fafc",
    textSecondary: "#94a3b8",
    divider: "rgba(255, 255, 255, 0.08)",
    contrastText: "#070a11",
  },
  light: {
    default: "#eef1f7", // Soft slate — pure white reads flat behind glass blur
    paper: "rgba(255, 255, 255, 0.7)",
    textPrimary: "#0f172a",
    textSecondary: "#475569",
    divider: "rgba(15, 23, 42, 0.08)",
    contrastText: "#0f172a",
  },
} as const;

export function getTheme(mode: PaletteMode) {
  const s = mode === "light" ? SURFACES.light : SURFACES.dark;
  const isLight = mode === "light";

  return createTheme({
    palette: {
      mode,
      primary: {
        main: "#c6ff33", // Electric Lime CTA
        contrastText: s.contrastText,
      },
      secondary: {
        main: "#38bdf8", // Cyber Blue
        contrastText: s.contrastText,
      },
      background: {
        default: s.default,
        paper: s.paper,
      },
      text: {
        primary: s.textPrimary,
        secondary: s.textSecondary,
      },
      divider: s.divider,
      accent: {
        lime: "#c6ff33",
        blue: "#38bdf8",
        green: "#34d399",
        amber: "#fbbf24",
        purple: "#818cf8",
      },
    },
    typography: {
      fontFamily: "var(--font-inter), Inter, system-ui, sans-serif",
      h1: { fontFamily: "var(--font-outfit), Outfit, sans-serif", fontWeight: 700, letterSpacing: "-0.02em" },
      h2: { fontFamily: "var(--font-outfit), Outfit, sans-serif", fontWeight: 700, letterSpacing: "-0.02em" },
      h3: { fontFamily: "var(--font-outfit), Outfit, sans-serif", fontWeight: 600, letterSpacing: "-0.01em" },
      h4: { fontFamily: "var(--font-outfit), Outfit, sans-serif", fontWeight: 600 },
      h5: { fontFamily: "var(--font-outfit), Outfit, sans-serif", fontWeight: 600 },
      h6: { fontFamily: "var(--font-outfit), Outfit, sans-serif", fontWeight: 600 },
      subtitle1: { fontFamily: "var(--font-outfit), Outfit, sans-serif", fontWeight: 500 },
      subtitle2: { fontFamily: "var(--font-outfit), Outfit, sans-serif", fontWeight: 500 },
      button: { fontFamily: "var(--font-outfit), Outfit, sans-serif", fontWeight: 600, textTransform: "none" },
    },
    shape: {
      borderRadius: 14,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: s.default,
            backgroundImage: isLight
              ? `
                radial-gradient(circle at 15% 15%, rgba(198, 255, 51, 0.08) 0%, transparent 40%),
                radial-gradient(circle at 85% 85%, rgba(56, 189, 248, 0.08) 0%, transparent 40%)
              `
              : `
                radial-gradient(circle at 15% 15%, rgba(198, 255, 51, 0.05) 0%, transparent 40%),
                radial-gradient(circle at 85% 85%, rgba(56, 189, 248, 0.05) 0%, transparent 40%)
              `,
            backgroundAttachment: "fixed",
            color: s.textPrimary,
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundImage: "none",
            backgroundColor: s.paper,
            backdropFilter: "blur(16px)",
            border: `1px solid ${s.divider}`,
            boxShadow: isLight
              ? "0 8px 32px 0 rgba(15, 23, 42, 0.08), inset 0 1px 0 0 rgba(255, 255, 255, 0.6)"
              : "0 8px 32px 0 rgba(0, 0, 0, 0.4)",
            borderRadius: 14,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            fontWeight: 600,
            transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            textTransform: "none",
          },
          contained: {
            backgroundColor: "#c6ff33",
            color: s.contrastText,
            boxShadow: isLight
              ? "0 4px 16px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.5)"
              : "0 0 20px rgba(198, 255, 51, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.4)",
            "&:hover": {
              backgroundColor: isLight ? "#b8f014" : "#d4ff59",
              boxShadow: isLight
                ? "0 6px 20px rgba(15, 23, 42, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.6)"
                : "0 0 28px rgba(198, 255, 51, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
              transform: "translateY(-1px)",
            },
          },
          outlined: {
            borderColor: isLight ? "rgba(15, 23, 42, 0.15)" : "rgba(255, 255, 255, 0.15)",
            color: s.textPrimary,
            backdropFilter: "blur(8px)",
            "&:hover": {
              borderColor: "#c6ff33",
              backgroundColor: isLight ? "rgba(198, 255, 51, 0.15)" : "rgba(198, 255, 51, 0.08)",
              boxShadow: isLight ? "none" : "0 0 16px rgba(198, 255, 51, 0.15)",
            },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            transition: "all 0.2s ease-in-out",
            "&:hover": {
              backgroundColor: isLight ? "rgba(15, 23, 42, 0.05)" : "rgba(255, 255, 255, 0.05)",
            },
            "&.Mui-selected": {
              backgroundColor: isLight ? "rgba(198, 255, 51, 0.18)" : "rgba(198, 255, 51, 0.12)",
              borderLeft: "3px solid #c6ff33",
              "&:hover": {
                backgroundColor: isLight ? "rgba(198, 255, 51, 0.26)" : "rgba(198, 255, 51, 0.18)",
              },
            },
          },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundColor: isLight ? "rgba(255, 255, 255, 0.75)" : "rgba(7, 10, 17, 0.8)",
            backdropFilter: "blur(20px)",
            borderBottom: `1px solid ${s.divider}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: isLight ? "rgba(255, 255, 255, 0.85)" : "rgba(11, 16, 27, 0.95)",
            backdropFilter: "blur(24px)",
            borderRight: `1px solid ${s.divider}`,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontWeight: 600,
            backdropFilter: "blur(8px)",
          },
        },
      },
    },
  });
}
