import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import UnitsProvider from "@/components/UnitsProvider";
import Footer from "@/components/shell/Footer";
import TabBar from "@/components/shell/TabBar";
import TopBar from "@/components/shell/TopBar";
import "./globals.css";

// Fonts are bundled from app/fonts (SIL Open Font License, see the .LICENSE
// files there), so builds don't depend on a font CDN.
const display = localFont({
  src: "./fonts/space-grotesk-latin-wght-normal.woff2",
  variable: "--font-space-grotesk",
  weight: "300 700",
  display: "swap",
});
const body = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});
const mono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-jetbrains-mono",
  weight: "100 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Planet Hunter - Candidate exoplanet signals from public TESS data",
  description:
    "An open build-in-public demo that hunts repeating dips in NASA TESS light curves. Candidate signals, never discoveries.",
  // Which commit this build came from (set by Railway); lets staging checks confirm the live build.
  other: { "ph-build": process.env.NEXT_PUBLIC_BUILD_SHA || "local" },
};

export const viewport: Viewport = {
  themeColor: "#04060d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <UnitsProvider>
          <TopBar />
          <main id="main" className="page" tabIndex={-1}>
            {children}
            <Footer />
          </main>
          <TabBar />
        </UnitsProvider>
      </body>
    </html>
  );
}
