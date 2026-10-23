"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { toVector, wrapLon } from "@/lib/globe";

export type EarthSceneProps = {
  sun: { lat: number; lon: number };
  iss: { latitude: number; longitude: number; altitude_km: number } | null;
  /** When false, nothing is drawn per frame. */
  running: boolean;
  onReady: () => void;
  onLost: () => void;
};

const EARTH_KM = 6371;
const TILT = 22; // degrees of latitude the camera looks down from
const DIST = 4.3; // camera distance in globe radii: the whole globe and its glow fit in a 30 degree view
const DRIFT = 2; // degrees of longitude per second the camera circles the globe

function Grid() {
  const geometry = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const add = (lat: number, lon: number) => pts.push(new THREE.Vector3(...toVector(lat, lon)).multiplyScalar(1.002));
    for (let lon = -180; lon < 180; lon += 30) {
      for (let lat = -90; lat < 90; lat += 5) { add(lat, lon); add(lat + 5, lon); }
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let lon = -180; lon < 180; lon += 5) { add(lat, lon); add(lat, lon + 5); }
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#7cc4ff" transparent opacity={0.28} />
    </lineSegments>
  );
}

function Rig({ lon0, running }: { lon0: number; running: boolean }) {
  const { camera, invalidate } = useThree();
  const elapsed = useRef(0);
  useFrame((_, dt) => {
    if (!running) return;
    elapsed.current += Math.min(dt, 0.1);
    const lon = wrapLon(lon0 + DRIFT * elapsed.current);
    const [x, y, z] = toVector(TILT, lon);
    camera.position.set(x * DIST, y * DIST, z * DIST);
    camera.lookAt(0, 0, 0);
  });
  useEffect(() => {
    const [x, y, z] = toVector(TILT, lon0);
    camera.position.set(x * DIST, y * DIST, z * DIST);
    camera.lookAt(0, 0, 0);
    invalidate();
  }, [camera, lon0, invalidate]);
  return null;
}

export default function EarthScene3D({ sun, iss, running, onReady, onLost }: EarthSceneProps) {
  const sunAt = useMemo(() => toVector(sun.lat, sun.lon).map((v) => v * 6) as [number, number, number], [sun.lat, sun.lon]);
  const issAt = useMemo(() => {
    if (!iss) return null;
    return toVector(iss.latitude, iss.longitude).map((v) => v * (1 + iss.altitude_km / EARTH_KM) * 1.01) as [number, number, number];
  }, [iss]);
  // The camera starts facing the ISS (or the Greenwich meridian when there is no position) and then drifts slowly.
  const lon0 = useRef(iss ? iss.longitude : 0).current;
  return (
    <Canvas
      className="earth-scene-3d"
      frameloop={running ? "always" : "never"}
      dpr={[1, 1.5]}
      camera={{ fov: 30, position: [0, 0, DIST] }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); onLost(); });
        requestAnimationFrame(onReady);
      }}
    >
      <Rig lon0={lon0} running={running} />
      <ambientLight intensity={1.1} color="#5b7cc0" />
      <directionalLight position={sunAt} intensity={2.6} color="#fff3dc" />
      <mesh>
        <sphereGeometry args={[1, 64, 48]} />
        <meshStandardMaterial color="#2a5ba6" roughness={0.9} metalness={0} />
      </mesh>
      <Grid />
      {issAt && (
        <mesh position={issAt}>
          <sphereGeometry args={[0.022, 16, 16]} />
          <meshBasicMaterial color="#ffb547" />
        </mesh>
      )}
    </Canvas>
  );
}
