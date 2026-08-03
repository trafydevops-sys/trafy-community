import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter, Outfit, Roboto } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeRegistry } from "@/components/theme-registry";
import "./globals.css";

const THEME_COOKIE = "trafy-theme";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-outfit" });
const roboto = Roboto({ subsets: ["latin"], weight: ["400"], variable: "--font-roboto" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "Trafy — Learn, connect, and get hired",
    template: "%s · Trafy",
  },
  description:
    "Trafy is a community-driven learning and hiring platform: build skills with expert-led courses and live classes, prove them with assessments, and connect directly with employers hiring on the platform.",
  openGraph: {
    type: "website",
    siteName: "Trafy",
    title: "Trafy — Learn, connect, and get hired",
    description:
      "Community-driven learning and hiring: courses, live classes, assessments, and a direct path from skill to job.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trafy — Learn, connect, and get hired",
    description:
      "Community-driven learning and hiring: courses, live classes, assessments, and a direct path from skill to job.",
  },
  robots: { index: true, follow: true },
};

export const viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const storedTheme = cookieStore.get(THEME_COOKIE)?.value;
  const hasStoredPreference = storedTheme === "light" || storedTheme === "dark";
  const initialMode = storedTheme === "light" ? "light" : "dark";

  return (
    <html lang="en" data-theme={initialMode} suppressHydrationWarning className={`${inter.variable} ${outfit.variable} ${roboto.variable}`}>
      <body className="dark-glass-theme">
        <ThemeRegistry initialMode={initialMode} hasStoredPreference={hasStoredPreference}>
          <AuthProvider>{children}</AuthProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}

