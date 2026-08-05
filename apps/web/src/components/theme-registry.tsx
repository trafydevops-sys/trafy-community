"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { useServerInsertedHTML } from "next/navigation";
import { ThemeProvider, type PaletteMode } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { getTheme } from "@/lib/theme";

const THEME_COOKIE = "trafy-theme";
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const ThemeModeContext = createContext<{
  mode: PaletteMode;
  toggleMode: () => void;
  /** Select a mode directly, for pickers that show every option at once
   *  rather than flipping between two. */
  setMode: (mode: PaletteMode) => void;
} | null>(null);

export function useThemeMode() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error("useThemeMode must be used within ThemeRegistry");
  return ctx;
}

function applyMode(mode: PaletteMode) {
  document.documentElement.dataset.theme = mode;
  document.cookie = `${THEME_COOKIE}=${mode}; Max-Age=${THEME_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
}

// Standard MUI + Next.js App Router integration: a single emotion cache per
// request, with styles flushed into the initial HTML response so there's no
// flash-of-unstyled-content on first paint.
export function ThemeRegistry({
  children,
  initialMode,
  hasStoredPreference,
}: {
  children: ReactNode;
  initialMode: PaletteMode;
  hasStoredPreference: boolean;
}) {
  const [mode, setMode] = useState<PaletteMode>(initialMode);

  useEffect(() => {
    // Only when no cookie exists yet: sync to OS preference once, so a
    // first-time visitor whose system prefers light doesn't get stuck in the
    // server-rendered dark default. This is a one-time, accepted flash — every
    // subsequent load already has the cookie and renders correctly server-side.
    if (hasStoredPreference) return;
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    if (prefersLight) {
      setMode("light");
      applyMode("light");
    } else {
      applyMode("dark");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [{ cache, flush }] = useState(() => {
    const cache = createCache({ key: "mui" });
    cache.compat = true;
    const prevInsert = cache.insert;
    let inserted: string[] = [];
    cache.insert = (...args) => {
      const serialized = args[1];
      if (cache.inserted[serialized.name] === undefined) {
        inserted.push(serialized.name);
      }
      return prevInsert(...args);
    };
    const flush = () => {
      const prevInserted = inserted;
      inserted = [];
      return prevInserted;
    };
    return { cache, flush };
  });

  useServerInsertedHTML(() => {
    const names = flush();
    if (names.length === 0) return null;
    let styles = "";
    for (const name of names) {
      styles += cache.inserted[name];
    }
    return (
      <style
        key={cache.key}
        data-emotion={`${cache.key} ${names.join(" ")}`}
        dangerouslySetInnerHTML={{ __html: styles }}
      />
    );
  });

  const theme = useMemo(() => getTheme(mode), [mode]);

  const selectMode = (next: PaletteMode) => {
    setMode(next);
    applyMode(next);
  };

  const toggleMode = () => selectMode(mode === "light" ? "dark" : "light");

  return (
    <CacheProvider value={cache}>
      <ThemeModeContext.Provider value={{ mode, toggleMode, setMode: selectMode }}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {children}
        </ThemeProvider>
      </ThemeModeContext.Provider>
    </CacheProvider>
  );
}
