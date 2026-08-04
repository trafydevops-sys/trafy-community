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

// LinkedIn inspired light mode UI theme
const SURFACES = {
  light: {
    default: "#f3f2ef", // LinkedIn warm gray
    paper: "#ffffff",
    textPrimary: "rgba(0,0,0,0.9)",
    textSecondary: "rgba(0,0,0,0.6)",
    divider: "rgba(0, 0, 0, 0.08)",
    contrastText: "#ffffff",
  },
} as const;

export function getTheme(mode: PaletteMode) {
  // Force light mode for LinkedIn style, ignoring 'mode' parameter for now 
  // to ensure consistent corporate look
  const s = SURFACES.light;
  
  return createTheme({
    palette: {
      mode: "light",
      primary: {
        main: "#0a66c2", // LinkedIn blue
        contrastText: s.contrastText,
      },
      secondary: {
        main: "#000000", 
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
        lime: "#0a66c2", // Map all accents to appropriate corporate colors or keep standard
        blue: "#0a66c2",
        green: "#057642", // LinkedIn green for success/active
        amber: "#f8c77e", // LinkedIn premium gold
        purple: "#818cf8",
      },
    },
    typography: {
      fontFamily: '-apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Fira Sans", Ubuntu, Oxygen, "Oxygen Sans", Cantarell, "Droid Sans", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Lucida Grande", Helvetica, Arial, sans-serif',
      h1: { fontWeight: 600, letterSpacing: "-0.02em" },
      h2: { fontWeight: 600, letterSpacing: "-0.01em" },
      h3: { fontWeight: 600 },
      h4: { fontWeight: 600 },
      h5: { fontWeight: 600 },
      h6: { fontWeight: 600 },
      subtitle1: { fontWeight: 500 },
      subtitle2: { fontWeight: 500 },
      button: { fontWeight: 600, textTransform: "none" },
      body1: { fontSize: "0.875rem" },
      body2: { fontSize: "0.875rem" },
    },
    shape: {
      borderRadius: 8,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: s.default,
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
            backdropFilter: "none",
            border: `1px solid ${s.divider}`,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.08)",
            borderRadius: 8,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 24, // Pill shape
            fontWeight: 600,
            transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            textTransform: "none",
            boxShadow: "none",
          },
          contained: {
            backgroundColor: "#0a66c2",
            color: "#ffffff",
            boxShadow: "none",
            "&:hover": {
              backgroundColor: "#004182",
              boxShadow: "none",
              transform: "none",
            },
          },
          outlined: {
            borderColor: "#0a66c2",
            color: "#0a66c2",
            backdropFilter: "none",
            borderWidth: 1,
            "&:hover": {
              borderColor: "#0a66c2",
              borderWidth: 2,
              backgroundColor: "rgba(10, 102, 194, 0.08)",
              boxShadow: "none",
            },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 0,
            transition: "none",
            "&:hover": {
              backgroundColor: "rgba(0, 0, 0, 0.08)",
            },
            "&.Mui-selected": {
              backgroundColor: "transparent",
              borderLeft: "3px solid #0a66c2",
              color: "#0a66c2",
              "&:hover": {
                backgroundColor: "rgba(0, 0, 0, 0.08)",
              },
            },
          },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundColor: "#ffffff",
            borderBottom: "1px solid rgba(0,0,0,0.08)",
            color: "rgba(0,0,0,0.6)",
            backdropFilter: "none",
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: "#ffffff",
            backdropFilter: "none",
            borderRight: "1px solid rgba(0,0,0,0.08)",
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
