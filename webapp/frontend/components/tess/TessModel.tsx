"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export const MODEL_URL = "/models/tess-a.glb";
// The NASA model is Draco-compressed; the decoder (Apache-2.0) is copied from three.js into /public/draco.
const DRACO_PATH = "/draco/";

/** A simple stand-in if the NASA model cannot be loaded: a bus, four cameras and two solar panels. */
function Procedural() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[1.2, 0.6, 1.2]} />
        <meshStandardMaterial color="#b8c0d6" metalness={0.4} roughness={0.5} />
      </mesh>
      {[-0.42, -0.14, 0.14, 0.42].map((x) => (
        <mesh key={x} position={[x, 0.65, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 0.7, 24]} />
          <meshStandardMaterial color="#2a3350" />
        </mesh>
      ))}
      {[-1.4, 1.4].map((x) => (
        <mesh key={x} position={[x, 0, 0]}>
          <boxGeometry args={[1.4, 0.04, 0.9]} />
          <meshStandardMaterial color="#1f3b8a" metalness={0.2} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function Spin({ children, still }: { children: React.ReactNode; still: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!still && g.current) g.current.rotation.y += dt * 0.3;
  });
  return <group ref={g}>{children}</group>;
}

export default function TessModel({ reducedMotion, onSource }: { reducedMotion: boolean; onSource: (s: "nasa" | "procedural") => void }) {
  const [model, setModel] = useState<THREE.Object3D | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const draco = new DRACOLoader().setDecoderPath(DRACO_PATH).setDecoderConfig({ type: "wasm" });
    const loader = new GLTFLoader().setDRACOLoader(draco);
    loader.load(
      MODEL_URL,
      (gltf) => {
        if (cancelled) return;
        const obj = gltf.scene;
        // Center and scale to about 3 units across.
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3()).length() || 1;
        const center = box.getCenter(new THREE.Vector3());
        obj.position.sub(center);
        const wrap = new THREE.Group();
        wrap.add(obj);
        wrap.scale.setScalar(3 / size);
        setModel(wrap);
        onSource("nasa");
      },
      undefined,
      () => {
        if (cancelled) return;
        setFailed(true);
        onSource("procedural");
      },
    );
    return () => {
      cancelled = true;
      draco.dispose();
    };
  }, [onSource]);

  return (
    <div className="tess-model" data-testid="tess-model" data-model={model ? "nasa" : failed ? "procedural" : "loading"}
      role="img" aria-label="3D model of the TESS spacecraft">
      <Canvas dpr={[1, 2]} camera={{ position: [3.2, 2, 3.2], fov: 45 }} frameloop={reducedMotion ? "demand" : "always"}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 6, 3]} intensity={1.6} />
        <Suspense fallback={null}>
          <Spin still={reducedMotion}>{model ? <primitive object={model} /> : failed ? <Procedural /> : null}</Spin>
        </Suspense>
      </Canvas>
    </div>
  );
}
