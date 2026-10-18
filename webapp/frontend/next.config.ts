import type { NextConfig } from "next";

// Content Security Policy: only the hosts the pages need (docs/DATA_SOURCES.md).
//   API backend          NEXT_PUBLIC_API_BASE (fetches from the browser)
//   apod.nasa.gov        picture of the day
//   tile.openstreetmap.org  ISS map tiles
//   *.cds.unistra.fr, *.u-strasbg.fr  Aladin Lite script and its sky image tiles (loaded on request)
// Next.js injects inline scripts, so 'unsafe-inline' stays until Phase 10 adds nonces;
// Aladin Lite needs WebAssembly ('wasm-unsafe-eval').
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";
const API_ORIGIN = new URL(API_BASE).origin;
const CDS = "https://*.cds.unistra.fr https://*.u-strasbg.fr";
const dev = process.env.NODE_ENV !== "production";

export const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""} https://aladin.cds.unistra.fr`,
  "style-src 'self' 'unsafe-inline' https://aladin.cds.unistra.fr",
  `img-src 'self' data: blob: ${API_ORIGIN} https://apod.nasa.gov https://tile.openstreetmap.org ${CDS}`,
  `connect-src 'self' ${API_ORIGIN} ${CDS}`,
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // The browser reaches the API through this origin, so the classroom session cookie is
  // first-party (the frontend and backend hosts are different sites on Railway).
  async rewrites() {
    return [{ source: "/api/v2/:path*", destination: `${API_BASE}/api/v2/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          // OpenStreetMap's tile policy asks for a Referer, which this policy still sends (origin only).
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
