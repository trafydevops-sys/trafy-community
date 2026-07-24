import type { Metadata } from "next";
import { Inter, Roboto } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeRegistry } from "@/components/theme-registry";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-inter" });
const roboto = Roboto({ subsets: ["latin"], weight: ["400"], variable: "--font-roboto" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "Trafy Community — Learn, connect, and get hired",
    template: "%s · Trafy Community",
  },
  description:
    "Trafy Community is a community-driven learning and hiring platform: build skills with expert-led courses and live classes, prove them with assessments, and connect directly with employers hiring on the platform.",
  openGraph: {
    type: "website",
    siteName: "Trafy Community",
    title: "Trafy Community — Learn, connect, and get hired",
    description:
      "Community-driven learning and hiring: courses, live classes, assessments, and a direct path from skill to job.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trafy Community — Learn, connect, and get hired",
    description:
      "Community-driven learning and hiring: courses, live classes, assessments, and a direct path from skill to job.",
  },
  robots: { index: true, follow: true },
};

export const viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${roboto.variable}`}>
      <body>
        <ThemeRegistry>
          <AuthProvider>{children}</AuthProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
