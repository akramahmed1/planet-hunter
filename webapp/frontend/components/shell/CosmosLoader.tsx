"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useWebGL } from "@/components/three/hooks";

// three.js loads after first paint (and only where WebGL works), so it never counts toward first-load JS.
const CosmosBackground = dynamic(() => import("./CosmosBackground"), { ssr: false });

export default function CosmosLoader() {
  const webgl = useWebGL();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback;
    const id = idle ? idle(() => setReady(true), { timeout: 2000 }) : window.setTimeout(() => setReady(true), 800);
    return () => {
      if (!idle) window.clearTimeout(id);
    };
  }, []);
  return ready && webgl ? <CosmosBackground /> : null;
}
