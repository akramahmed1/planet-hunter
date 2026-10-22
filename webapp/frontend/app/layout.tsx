import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { getFeatures } from "@/lib/features";
import { siteUrl } from "@/lib/site";
import UnitsProvider from "@/components/UnitsProvider";
import CosmosLoader from "@/components/shell/CosmosLoader";
import Footer from "@/components/shell/Footer";
import TabBar from "@/components/shell/TabBar";
import StatusStrip from "@/components/shell/StatusStrip";
import TopBar from "@/components/shell/TopBar";
import Watermark from "@/components/shell/Watermark";
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
  metadataBase: siteUrl(),
  title: {
    default: "Planet Hunter - Candidate exoplanet signals from public TESS data",
    template: "%s - Planet Hunter",
  },
  description:
    "An open build-in-public demo that hunts repeating dips in NASA TESS light curves. Candidate signals, never discoveries.",
  openGraph: { siteName: "Planet Hunter", type: "website" },
  twitter: { card: "summary_large_image" },
  // Which commit this build came from (set by Railway); lets staging checks confirm the live build.
  other: { "ph-build": process.env.NEXT_PUBLIC_BUILD_SHA || "local" },
};

export const viewport: Viewport = {
  themeColor: "#04060d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { classroom } = await getFeatures();
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <CosmosLoader />
        <Watermark />
        <UnitsProvider>
          <TopBar classroom={classroom} />
          <StatusStrip />
          <main id="main" className="page" tabIndex={-1}>
            {children}
            <Footer />
          </main>
          <TabBar classroom={classroom} />
        </UnitsProvider>
      </body>
    </html>
  );
}
