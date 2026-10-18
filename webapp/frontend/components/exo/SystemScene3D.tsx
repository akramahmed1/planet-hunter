"use client";

import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SystemModel } from "./model";
import type { Pick } from "./SystemMap2D";

const TAP_PX = 6;
const toV = ([x, y]: readonly [number, number]) => new THREE.Vector3(x, 0, -y);

function Controls({ extent }: { extent: number }) {
  const { camera, gl, invalidate } = useThree();
  const controls = useMemo(() => new OrbitControls(camera), [camera]);
  useEffect(() => {
    controls.connect(gl.domElement);
    const on = () => invalidate();
    controls.addEventListener("change", on);
    return () => {
      controls.removeEventListener("change", on);
      controls.disconnect();
    };
  }, [controls, gl, invalidate]);
  useEffect(() => {
    camera.position.set(0, extent * 1.6, extent * 1.4);
    camera.near = extent / 1000;
    camera.far = extent * 30;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.minDistance = extent * 0.05;
    controls.maxDistance = extent * 8;
    controls.update();
    invalidate();
  }, [camera, controls, extent, invalidate]);
  return null;
}

function Line({ points, color, dashed }: { points: THREE.Vector3[]; color: string; dashed?: boolean }) {
  const line = useMemo(() => {
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: 0.02, gapSize: 0.015, scale: 1 })
      : new THREE.LineBasicMaterial({ color });
    const l = new THREE.LineLoop(geom, mat);
    if (dashed) l.computeLineDistances();
    return l;
  }, [points, color, dashed]);
  useEffect(() => () => {
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  }, [line]);
  return <primitive object={line} />;
}

export default function SystemScene3D({
  model,
  starColor,
  selected,
  onPick,
}: {
  model: SystemModel;
  starColor: string;
  selected: Pick | null;
  onPick: (p: Pick) => void;
}) {
  const [ready, setReady] = useState(false);
  const E = model.extent;
  const dot = E * 0.025;
  const tap = (e: ThreeEvent<MouseEvent>, p: Pick) => {
    e.stopPropagation();
    if (e.delta <= TAP_PX) onPick(p);
  };
  const z = model.zone;
  return (
    <div className={ready ? "scene-3d scene-3d--ready" : "scene-3d"} data-testid="system-3d" data-ready={ready}
      role="img" aria-label="3D view of the planetary system. Use the buttons below to choose a body.">
      <Canvas frameloop="demand" dpr={[1, 2]} camera={{ fov: 50 }} onCreated={() => requestAnimationFrame(() => setReady(true))}>
        <Controls extent={E} />
        {z && (
          <>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[z.optimistic_inner_au, z.optimistic_outer_au, 96]} />
              <meshBasicMaterial color="#4fe0b0" transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0001 * E, 0]}>
              <ringGeometry args={[z.conservative_inner_au, z.conservative_outer_au, 96]} />
              <meshBasicMaterial color="#4fe0b0" transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          </>
        )}
        {model.planets.map((p) => (
          <Line key={`o${p.index}`} points={p.orbit.map(toV)} color={p.signal ? "#ffb547" : "#31406a"} dashed={p.signal} />
        ))}
        <mesh onClick={(e) => tap(e, { kind: "star" })}>
          <sphereGeometry args={[Math.max(model.starRadius, dot * 1.6), 32, 32]} />
          <meshBasicMaterial color={starColor} />
        </mesh>
        {model.planets.map((p) => {
          const on = selected?.kind === "planet" && selected.index === p.index;
          return (
            <group key={p.index} position={toV(p.at)}>
              <mesh onClick={(e) => tap(e, { kind: "planet", index: p.index })}>
                <sphereGeometry args={[dot * 2.5, 12, 12]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              <mesh>
                <sphereGeometry args={[dot, 20, 20]} />
                <meshBasicMaterial color={p.signal ? "#ffb547" : "#7cc4ff"} />
              </mesh>
              {on && (
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[dot * 1.6, dot * 1.9, 40]} />
                  <meshBasicMaterial color="#b0dcff" side={THREE.DoubleSide} />
                </mesh>
              )}
            </group>
          );
        })}
      </Canvas>
    </div>
  );
}
