import { createTheme } from "@mui/material/styles";
import { grey } from "@mui/material/colors";

declare module "@mui/material/styles" {
  interface Palette {
    accent: {
      lime: string;
      blue: string;
      green: string;
      amber: string;
    };
  }
  interface PaletteOptions {
    accent?: {
      lime: string;
      blue: string;
      green: string;
      amber: string;
    };
  }
}

// Primary palette: white surfaces + grey scale, per the design brief. CTAs
// are black (not MUI's default blue) — set as `primary` so `color="primary"`
// on buttons/links is the one true CTA color across the app.
export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#111111",
      contrastText: "#ffffff",
    },
    secondary: {
      main: grey[700],
    },
    background: {
      default: "#ffffff",
      paper: "#ffffff",
    },
    text: {
      primary: grey[900],
      secondary: grey[600],
    },
    divider: grey[200],
    // 3-4 accent/highlight colors, used sparingly (badges, chips, small
    // status accents) — never as a page's primary CTA color.
    accent: {
      lime: "#c6ff33", // carried over from the existing brand accent
      blue: "#2563eb",
      green: "#1a7a3c",
      amber: "#b45309",
    },
  },
  typography: {
    fontFamily: "var(--font-roboto), Roboto, Arial, sans-serif",
    h1: { fontFamily: "var(--font-inter), Inter, sans-serif", fontWeight: 600 },
    h2: { fontFamily: "var(--font-inter), Inter, sans-serif", fontWeight: 600 },
    h3: { fontFamily: "var(--font-inter), Inter, sans-serif", fontWeight: 600 },
    h4: { fontFamily: "var(--font-inter), Inter, sans-serif", fontWeight: 600 },
    h5: { fontFamily: "var(--font-inter), Inter, sans-serif", fontWeight: 600 },
    h6: { fontFamily: "var(--font-inter), Inter, sans-serif", fontWeight: 600 },
    button: { fontFamily: "var(--font-inter), Inter, sans-serif", fontWeight: 500, textTransform: "none" },
  },
  shape: {
    borderRadius: 10,
  },
  transitions: {
    // "Limit animations" — keep only Material's regulated interaction
    // feedback (ripple, focus), and make it snappy rather than decorative.
    duration: {
      shortest: 100,
      shorter: 120,
      short: 150,
      standard: 180,
      complex: 200,
      enteringScreen: 150,
      leavingScreen: 120,
    },
  },
  components: {
    MuiLink: {
      defaultProps: { underline: "hover" },
      styleOverrides: {
        root: { fontFamily: "var(--font-inter), Inter, sans-serif", fontWeight: 500 },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 10 },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { borderBottom: `1px solid ${grey[200]}` },
      },
    },
  },
});
