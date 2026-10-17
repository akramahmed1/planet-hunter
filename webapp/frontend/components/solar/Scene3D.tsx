"use client";

// The 3D view. Loaded on demand (next/dynamic) so three.js never weighs on the
// first paint; the 2D map is shown until this is ready.
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BODY_COLORS, BODY_NAMES, type SceneBodyId, type Vec3 } from "@/lib/solar";
import { markerRadius, type SceneModel } from "./model";

// Ecliptic (x, y in the plane, z north) to three.js (y up).
const toThree = (p: Vec3) => new THREE.Vector3(p[0], p[2], -p[1]);

/** A pointer that moved more than this between down and up was a drag, not a tap. */
const TAP_PX = 6;

type Props = {
  model: SceneModel;
  highlight: SceneBodyId[];
  focus: SceneBodyId | null;
  line: [SceneBodyId, SceneBodyId] | null;
  reducedMotion: boolean;
  onPick: (id: SceneBodyId) => void;
  onEmpty: () => void;
  ready: boolean;
  onReady: () => void;
};

function Controls({ extent, focus, at, reducedMotion }: {
  extent: number;
  focus: SceneBodyId | null;
  at: Partial<Record<SceneBodyId, THREE.Vector3>>;
  reducedMotion: boolean;
}) {
  const { camera, gl, invalidate } = useThree();
  const controls = useMemo(() => new OrbitControls(camera), [camera]);
  const goal = useRef(new THREE.Vector3());

  useEffect(() => {
    controls.connect(gl.domElement);
    const onChange = () => invalidate();
    controls.addEventListener("change", onChange);
    return () => {
      controls.removeEventListener("change", onChange);
      controls.disconnect();
    };
  }, [controls, gl, invalidate]);

  useEffect(() => {
    controls.enableDamping = !reducedMotion;
    controls.minDistance = extent * 0.02;
    controls.maxDistance = extent * 8;
  }, [controls, extent, reducedMotion]);

  // Frame the whole view when the extent changes (zoom or scale switch).
  useEffect(() => {
    camera.position.set(0, extent * 1.5, extent * 1.3);
    camera.near = extent / 2000;
    camera.far = extent * 20;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    goal.current.set(0, 0, 0);
    controls.update();
    invalidate();
  }, [camera, controls, extent, invalidate]);

  // Centre on the focused body: an eased move, or a jump with reduced motion.
  useEffect(() => {
    const p = focus ? at[focus] : undefined;
    goal.current.copy(p ?? new THREE.Vector3());
    if (reducedMotion) {
      controls.target.copy(goal.current);
      controls.update();
    }
    invalidate();
  }, [focus, at, reducedMotion, controls, invalidate]);

  useFrame(() => {
    if (!reducedMotion && controls.target.distanceTo(goal.current) > extent * 1e-4) {
      controls.target.lerp(goal.current, 0.15);
      invalidate();
    }
    if (controls.update()) invalidate();
  });
  return null;
}

function OrbitLine({ points }: { points: Vec3[] }) {
  const line = useMemo(() => {
    const geom = new THREE.BufferGeometry().setFromPoints(points.map(toThree));
    const mat = new THREE.LineBasicMaterial({ color: "#31406a" });
    return new THREE.LineLoop(geom, mat);
  }, [points]);
  useEffect(() => () => {
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  }, [line]);
  return <primitive object={line} />;
}

function MeasureLine({ a, b }: { a: THREE.Vector3; b: THREE.Vector3 }) {
  const line = useMemo(() => {
    const geom = new THREE.BufferGeometry().setFromPoints([a, b]);
    return new THREE.Line(geom, new THREE.LineBasicMaterial({ color: "#4fe0b0" }));
  }, [a, b]);
  useEffect(() => () => {
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  }, [line]);
  return <primitive object={line} />;
}

export default function Scene3D({ model, highlight, focus, line, reducedMotion, onPick, onEmpty, ready, onReady }: Props) {
  const down = useRef<{ x: number; y: number } | null>(null);
  const at = useMemo(
    () => Object.fromEntries(model.bodies.map((b) => [b.id, toThree(b.p)])) as Partial<Record<SceneBodyId, THREE.Vector3>>,
    [model],
  );

  function tap(e: ThreeEvent<MouseEvent>, id: SceneBodyId) {
    e.stopPropagation();
    if (e.delta <= TAP_PX) onPick(id);
  }

  return (
    <div
      className={ready ? "scene-3d scene-3d--ready" : "scene-3d"}
      data-testid="scene-3d"
      data-ready={ready}
      role="img"
      aria-label="3D view of the solar system. Use the body buttons below to choose a body."
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY };
      }}
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ fov: 50 }}
        onCreated={() => requestAnimationFrame(onReady)}
        onPointerMissed={(e) => {
          const d = down.current;
          if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) <= TAP_PX) onEmpty();
        }}
      >
        <Controls extent={model.extent} focus={focus} at={at} reducedMotion={reducedMotion} />
        {model.orbits.map((o) => (
          <OrbitLine key={`${model.scale}-${o.id}`} points={o.points} />
        ))}
        {line && at[line[0]] && at[line[1]] && <MeasureLine a={at[line[0]]!} b={at[line[1]]!} />}
        {model.bodies.map(({ id }) => {
          const p = at[id]!;
          const r = markerRadius(id, model.extent);
          const on = highlight.includes(id);
          return (
            <group key={id} position={p} name={BODY_NAMES[id]}>
              {/* A larger invisible sphere makes small markers easy to tap. */}
              <mesh onClick={(e) => tap(e, id)}>
                <sphereGeometry args={[r * 2.5, 12, 12]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              <mesh>
                <sphereGeometry args={[r, 24, 24]} />
                <meshBasicMaterial color={BODY_COLORS[id]} />
              </mesh>
              {on && (
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[r * 1.6, r * 1.9, 48]} />
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
