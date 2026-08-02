# Light/Dark Theme Toggle — Design

## Context

`trafy-community` (`apps/web`) is a Next.js 15 (App Router) + MUI app. It currently has an uncommitted, in-progress visual redesign (`git diff` on `theme.ts`, `app-shell.tsx`, `globals.css`, `layout.tsx`) that moved the MUI theme from a plain light theme to a hardcoded **dark-only** glassmorphic "cyberpunk" look: deep obsidian backgrounds, frosted-glass `Paper`/`Drawer`/`AppBar` surfaces, neon-lime (`#c6ff33`) glow on buttons and selected nav items.

This is the first of several sub-projects under the "Global Shell & Onboarding" roadmap item (the others — AI onboarding, OAuth login, role dashboards/context switcher, PWA/push — are out of scope here and will get their own specs). The product doc calls for light + dark mode; today there is no toggle and the theme is hardcoded dark.

**Decision (confirmed with user):** keep the in-progress dark glass redesign as-is and build a **light mode that mirrors the same glass/neon aesthetic** (not the old flat light theme), plus a manual toggle.

## Architecture & data flow

Single source of truth: an HTTP cookie `trafy-theme` (`"light" | "dark"`, `Max-Age=31536000`, `Path=/`, `SameSite=Lax`), read **server-side**.

1. `apps/web/src/app/layout.tsx` (server component) reads the cookie via `next/headers` `cookies()`:
   - `initialMode: "light" | "dark"` — `"dark"` if the cookie is absent or invalid (matches today's baseline).
   - `hasStoredPreference: boolean` — whether the cookie was present at all.
2. `<html data-theme={initialMode} suppressHydrationWarning>` — this attribute drives the plain CSS custom properties in `globals.css` (`--ink`, `--muted`, `--line`, `--bg`, `--panel`, `--accent-*`, `--danger*`), which are consumed directly (not via MUI) by many pages: `jobs`, `learn`, `teach`, `institutions`, `contracts`, `hire`, `assess`, and the top-level `page.tsx`.
3. `ThemeRegistry` (`apps/web/src/components/theme-registry.tsx`) is extended to own theme-mode state:
   - Accepts `initialMode` / `hasStoredPreference` props from the layout.
   - Builds the MUI theme via a new `getTheme(mode)` factory in `apps/web/src/lib/theme.ts`, replacing today's single static `theme` export (it is the only import site, confirmed via search — no other call sites to update).
   - Exposes a `useThemeMode()` hook (`{ mode, toggleMode }`) via React context, for the toggle button in `AppShell`.
   - `toggleMode()` writes `document.cookie`, updates React state, and sets `document.documentElement.dataset.theme` — kept in sync on every toggle, no reload required.
4. **First-ever visit with no cookie:** OS color-scheme preference isn't known server-side without extra header plumbing (Client Hints aren't reliably sent). We render the `"dark"` default, then in a mount effect — **only when `hasStoredPreference` is false** — check `window.matchMedia('(prefers-color-scheme: light)')` and switch immediately if it matches, persisting the cookie so it never recurs. This produces one, standard, accepted flash for first-time visitors whose OS prefers light; every subsequent load is flash-free because the cookie now exists.

## Scope boundary

The manual toggle control lives inside `AppShell` (authenticated app pages only: feed, jobs, learn, etc.). Pre-auth pages (`/sign-in`, `/sign-up`, marketing `/`) still respect the cookie/system-preference default but have no manual switch in this iteration — straightforward to add later if desired.

No DB/API changes. No cross-device sync — this is a client + cookie concern only, consistent with the existing "known simplification" pattern already documented in `apps/web/src/lib/session.ts`.

## Palette

Same brand hues in both modes — only surface luminance, text color, and glow/shadow intensity change:

| Token | Dark (current, keep as-is) | Light (new) |
|---|---|---|
| `background.default` / `--bg` | `#070a11` | `#eef1f7` (soft slate, not pure white — glass needs a tinted backdrop to read as "frosted") |
| `background.paper` / `--panel` | `rgba(15,22,37,0.75)` | `rgba(255,255,255,0.7)` |
| `text.primary` / `--ink` | `#f8fafc` | `#0f172a` |
| `text.secondary` / `--muted` | `#94a3b8` | `#475569` (~7:1 contrast on `#eef1f7` — AA-safe) |
| `divider` / `--line` | `rgba(255,255,255,0.08)` | `rgba(15,23,42,0.08)` |
| link color `--accent-blue` | `#38bdf8` (AA-safe on near-black) | `#0284c7` (darker — the bright cyan fails AA as body-text color on a light background; this is the one accent that must shift between modes since `globals.css` uses it directly as `a { color }`) |
| `--danger` | `#f87171` | `#dc2626` (same AA-contrast reasoning) |
| `--danger-bg` | `rgba(239,68,68,0.1)` | `rgba(239,68,68,0.08)` |
| Button/nav glow shadows | bright rgba-lime glows | same hue, lower alpha, softer elevation-style shadow instead of a glow (a colored glow barely reads against a light backdrop, so it's replaced with a conventional soft shadow to keep the "lift" feeling) |
| `primary.contrastText` (CTA text on lime) | `#070a11` | `#0f172a` |

Component overrides needing an explicit light variant in `getTheme()`: `MuiCssBaseline` (body background/gradient), `MuiPaper`, `MuiButton` (`contained`/`outlined`), `MuiListItemButton` (hover/selected), `MuiAppBar`, `MuiDrawer`, `MuiChip`. Exact hex/alpha values above may be refined slightly during implementation; the ratios and reasoning should hold.

`globals.css` gets a parallel `html[data-theme="light"] { --ink: ...; ... }` override block (including scrollbar track/thumb colors), sitting alongside the existing `:root` (dark) block.

## AppShell changes

- **New slim top bar** in `apps/web/src/components/app-shell.tsx`: sticky (`position: sticky; top: 0`) bar spanning only the main-content column (to the right of the sidebar on desktop — the sidebar itself, with its logo/search/nav, is untouched). Holds one `IconButton` (sun/moon icon, swapping by mode) with an `aria-label` that reflects the action ("Switch to light mode" / "Switch to dark mode") for accessibility.
- On mobile, the same toggle icon is added into the *existing* mobile `AppBar` (next to the notifications icon) rather than introducing a second bar.
- No other changes to sidebar, drawer, or nav structure.

## Files touched

- `apps/web/src/lib/theme.ts` — static `theme` export → `getTheme(mode: "light" | "dark")` factory.
- `apps/web/src/components/theme-registry.tsx` — owns mode state, cookie read/write, context, `useThemeMode()` hook.
- `apps/web/src/app/layout.tsx` — reads cookie server-side, sets `data-theme` on `<html>`, passes `initialMode`/`hasStoredPreference` to `ThemeRegistry`.
- `apps/web/src/app/globals.css` — light-mode CSS variable override block.
- `apps/web/src/components/app-shell.tsx` — slim top bar (desktop) + toggle icon (mobile bar).

## Testing

Manual only, no automated test suite exists for this app today:
- Run the dev server, toggle in both mobile and desktop breakpoints.
- Confirm the cookie persists across a hard reload (no flash on repeat visits).
- Confirm plain-CSS pages (e.g. `/jobs`, `/learn`) and MUI-driven pages (e.g. `/feed`) both flip correctly and consistently.
- Eyeball contrast on body text and links in light mode.
