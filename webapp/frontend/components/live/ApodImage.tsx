"use client";

import { useEffect, useState } from "react";

// APOD pictures are hosted on apod.nasa.gov. During Phase 2 the API returned a
// placeholder link to the NASA logo instead, which v2 must not show (NASA's
// insignia is not public domain; docs/DATA_SOURCES.md), so other hosts are skipped.
const APOD_HOST = "apod.nasa.gov";

export function isApodImage(src: string): boolean {
  try {
    return new URL(src).hostname === APOD_HOST;
  } catch {
    return false;
  }
}

/**
 * The picture of the day, loaded in the browser after the page (it can be
 * large and isn't needed for first paint). Removed if it fails to load.
 */
export default function ApodImage({ src, alt }: { src: string; alt: string }) {
  const [show, setShow] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => setShow(true), []);
  if (!isApodImage(src)) {
    return null; // the backend rejects these; never show a developer message
  }
  if (!show || failed) return null;
  return <img className="tile-img" src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}
