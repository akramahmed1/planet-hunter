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
  /** Fly in close to the focused body and keep it centred while it moves (zoom to planet), not just recentre. */
  closeUp: boolean;
  line: [SceneBodyId, SceneBodyId] | null;
  reducedMotion: boolean;
  onPick: (id: SceneBodyId) => void;
  onEmpty: () => void;
  ready: boolean;
  onReady: () => void;
};

/**
 * How far from a zoomed-to body the camera sits: twice the body's own distance from the Sun, so the Sun and the
 * neighbouring orbits stay in the picture, and never closer than a fiftieth of the whole view.
 */
export function closeUpDistance(extent: number, at: THREE.Vector3): number {
  return Math.max(extent * 0.02, at.length() * 2);
}

function Controls({ extent, focus, closeUp, at, reducedMotion }: {
  extent: number;
  focus: SceneBodyId | null;
  closeUp: boolean;
  at: Partial<Record<SceneBodyId, THREE.Vector3>>;
  reducedMotion: boolean;
}) {
  const { camera, gl, invalidate } = useThree();
  const controls = useMemo(() => new OrbitControls(camera), [camera]);
  const goal = useRef(new THREE.Vector3());
  const arrived = useRef(true); // has the camera finished flying in to a zoomed-to body
  const wasCloseUp = useRef(false);

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
    arrived.current = !closeUp;
    controls.update();
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, controls, extent, invalidate]);

  // Zooming out (leaving a close up) frames the whole view again.
  useEffect(() => {
    if (wasCloseUp.current && !closeUp) {
      camera.position.set(0, extent * 1.5, extent * 1.3);
      controls.target.set(0, 0, 0);
      goal.current.set(0, 0, 0);
      controls.update();
      invalidate();
    }
    wasCloseUp.current = closeUp;
    arrived.current = !closeUp;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeUp, focus]);

  // Centre on the focused body: an eased move, or a jump with reduced motion.
  useEffect(() => {
    const p = focus ? at[focus] : undefined;
    goal.current.copy(p ?? new THREE.Vector3());
    if (reducedMotion) {
      const moved = goal.current.clone().sub(controls.target);
      controls.target.copy(goal.current);
      if (closeUp) {
        // Keep the same view of the body as it moves, and jump straight to the close distance once.
        camera.position.add(moved);
        if (!arrived.current) {
          const dir = camera.position.clone().sub(controls.target).setLength(closeUpDistance(extent, goal.current));
          camera.position.copy(controls.target).add(dir);
          arrived.current = true;
        }
      }
      controls.update();
    }
    invalidate();
  }, [focus, closeUp, at, reducedMotion, controls, camera, extent, invalidate]);

  useFrame(() => {
    if (!reducedMotion && controls.target.distanceTo(goal.current) > extent * 1e-4) {
      const before = controls.target.clone();
      controls.target.lerp(goal.current, closeUp ? 0.35 : 0.15);
      if (closeUp) camera.position.add(controls.target.clone().sub(before)); // the camera travels with the target
      invalidate();
    }
    if (!reducedMotion && closeUp && !arrived.current) {
      const dir = camera.position.clone().sub(controls.target);
      const want = closeUpDistance(extent, goal.current);
      const next = dir.length() + (want - dir.length()) * 0.15;
      if (Math.abs(next - want) < extent * 1e-3) arrived.current = true;
      camera.position.copy(controls.target).add(dir.setLength(arrived.current ? want : next));
      invalidate();
    }
    if (controls.update()) invalidate();
    // How far the camera is from what it looks at, as a share of the whole view: read by the browser tests.
    gl.domElement.dataset.viewDistance = (camera.position.distanceTo(controls.target) / extent).toFixed(3);
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

export default function Scene3D({ model, highlight, focus, closeUp, line, reducedMotion, onPick, onEmpty, ready, onReady }: Props) {
  const down = useRef<{ x: number; y: number } | null>(null);
  const at = useMemo(
    () => Object.fromEntries(model.bodies.map((b) => [b.id, toThree(b.p)])) as Partial<Record<SceneBodyId, THREE.Vector3>>,
    [model],
  );

  function tap(e: ThreeEvent<MouseEvent>, id: SceneBodyId) {
    e.stopPropagation();
    if (e.delta <= TAP_PX) onPick(id);
  }

  // Zoomed in, dots shrink with the camera distance so they keep the size they have in the whole view.
  const near = closeUp && focus && at[focus] ? closeUpDistance(model.extent, at[focus]!) : null;
  const dotScale = near ? Math.min(1, near / model.extent) : 1;

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
        <Controls extent={model.extent} focus={focus} closeUp={closeUp} at={at} reducedMotion={reducedMotion} />
        {model.orbits.map((o) => (
          <OrbitLine key={`${model.scale}-${o.id}`} points={o.points} />
        ))}
        {line && at[line[0]] && at[line[1]] && <MeasureLine a={at[line[0]]!} b={at[line[1]]!} />}
        {model.bodies.map(({ id }) => {
          const p = at[id]!;
          const r = markerRadius(id, model.extent) * dotScale;
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
