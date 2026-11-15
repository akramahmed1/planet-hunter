"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { moodFor } from "@/lib/cosmos";

// "Living cosmos": a slow nebula, a three-layer starfield and, now and then, a tiny dark disc crossing
// a background star (a transit, the idea this site is about). It sits behind everything and never takes
// input. Cheap by design: it renders at half resolution and is scaled up by CSS.
//   - reduced motion: one still frame, no animation loop
//   - tab hidden, or a heavy WebGL view (Solar System, Aladin) on screen: loop paused
//   - no WebGL, or the context is lost: nothing is drawn and the CSS gradient and stars stay

const MAX_DPR = 1.5;
const RENDER_SCALE = 0.5;
const STAR_COUNTS = [450, 250, 100]; // far, middle, near: 800 points
const LAYER_PARALLAX = [0.3, 0.6, 1];
const MAX_SHIFT_PX = 12;
const TRANSIT_MS = 1500;
const MOOD_FADE_MS = 800;

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec2 mod289(vec2 x){return x-floor(x*(1./289.))*289.;}
vec3 permute(vec3 x){return mod289(((x*34.)+1.)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);
  vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod289(i);
  vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
  vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.); m=m*m; m=m*m;
  vec3 x=2.*fract(p*C.www)-1.; vec3 h=abs(x)-.5; vec3 ox=floor(x+.5); vec3 a0=x-ox;
  m*=1.79284291400159-.85373472095314*(a0*a0+h*h);
  vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.*dot(m,g);
}`;

const NEBULA_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;

// Two or three octaves of simplex noise, drifting. Colours come from the site palette (--ion, --space-*).
const NEBULA_FRAG = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform float uAspect;
uniform vec3 uTint;
${NOISE}
void main(){
  vec2 p=vec2(vUv.x*uAspect,vUv.y)*1.35;
  float t=uTime;
  float cycle=6.2831853/90.;                    // the slow swell repeats every 90 s
  vec2 warp=vec2(sin(t*cycle),cos(t*cycle*.8))*.35;
  float n=snoise(p+warp+vec2(t*.004,t*.0025))*.55
        +snoise(p*2.1-warp*1.4+vec2(-t*.006,t*.004))*.3
        +snoise(p*4.3+vec2(t*.008,-t*.005))*.15;
  float cloud=smoothstep(-.15,.75,n);
  vec3 deep=vec3(.063,.12,.30);                  // blue
  vec3 ion=vec3(.486,.769,1.);                   // --ion
  vec3 violet=vec3(.36,.22,.62);
  vec3 col=mix(deep,mix(violet,ion,smoothstep(.2,.9,n)),cloud)+uTint;
  float vignette=smoothstep(1.2,.2,length(vUv-.5)*1.4);
  float a=cloud*vignette*.3;                     // opacity stays within .25 to .35 where the cloud is
  gl_FragColor=vec4(col,a);
}`;

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute float aTone;
uniform vec2 uShift;      // NDC offset for this layer
uniform float uPx;        // device pixels per css pixel at render scale
varying float vPhase;
varying float vTone;
void main(){
  vPhase=aPhase; vTone=aTone;
  gl_Position=vec4(position.xy+uShift,0.,1.);
  gl_PointSize=aSize*uPx;
}`;

const STAR_FRAG = /* glsl */ `
precision mediump float;
varying float vPhase;
varying float vTone;
uniform float uTime;
uniform float uTwinkle;
void main(){
  float d=length(gl_PointCoord-.5);
  float core=smoothstep(.5,.0,d);
  float tw=1.-uTwinkle*(.5+.5*sin(uTime*(.6+vPhase*.9)+vPhase*40.))*.55;
  vec3 c=mix(vec3(.8,.87,1.),vec3(1.,.95,.85),vTone);
  gl_FragColor=vec4(c,core*core*tw*(.5+vTone*.4));
}`;

const FEATURE_VERT = /* glsl */ `
uniform vec2 uPos;
uniform float uSize;
void main(){ gl_Position=vec4(uPos,0.,1.); gl_PointSize=uSize; }`;

const FEATURE_STAR_FRAG = /* glsl */ `
precision mediump float;
uniform float uDim;
void main(){
  float d=length(gl_PointCoord-.5);
  float core=smoothstep(.5,.0,d);
  gl_FragColor=vec4(vec3(.92,.95,1.),core*core*uDim);
}`;

const FEATURE_DISC_FRAG = /* glsl */ `
precision mediump float;
uniform float uOn;
void main(){
  float d=length(gl_PointCoord-.5);
  float disc=smoothstep(.5,.44,d);
  gl_FragColor=vec4(vec3(.016,.024,.05),disc*uOn);
}`;

function rand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** True when this point of the page holds no text (so a star may do its transit there). */
function isClearSpot(x: number, y: number): boolean {
  const el = document.elementFromPoint(x, y);
  if (!el) return true;
  if (el === document.documentElement || el === document.body) return true;
  return (el.textContent ?? "").trim() === "" && !el.closest("a, button, input, select, textarea, canvas, img, svg");
}

export default function CosmosBackground() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const path = usePathname();
  const mood = useRef<THREE.Vector3>(new THREE.Vector3());
  const moodFrom = useRef<THREE.Vector3>(new THREE.Vector3());
  const moodAt = useRef(0);
  const target = useRef<THREE.Vector3>(new THREE.Vector3());
  const redraw = useRef<() => void>(() => {});

  // Route mood: set the target tint; the loop (or a still redraw) crossfades to it over 800 ms.
  useEffect(() => {
    const [r, g, b] = moodFor(path);
    // A still or paused frame has no loop to crossfade in, so it snaps to the new tint.
    if (document.documentElement.dataset.cosmos !== "running") moodAt.current = -1e9;
    moodFrom.current.copy(mood.current);
    target.current.set(r, g, b);
    if (document.documentElement.dataset.cosmos === "running") moodAt.current = performance.now();
    redraw.current();
  }, [path]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: el, alpha: true, antialias: false, powerPreference: "low-power" });
    } catch {
      document.documentElement.dataset.cosmos = "off";
      return;
    }
    const html = document.documentElement;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = motionQuery.matches;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = true;

    const nebula = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: NEBULA_VERT,
        fragmentShader: NEBULA_FRAG,
        transparent: true,
        depthTest: false,
        uniforms: { uTime: { value: 0 }, uAspect: { value: 1 }, uTint: { value: new THREE.Vector3() } },
      }),
    );
    scene.add(nebula);

    // Three layers of stars, positions in NDC.
    const rnd = rand(20261019);
    const layers = STAR_COUNTS.map((count, layer) => {
      const pos = new Float32Array(count * 3);
      const size = new Float32Array(count);
      const phase = new Float32Array(count);
      const tone = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = rnd() * 2 - 1;
        pos[i * 3 + 1] = rnd() * 2 - 1;
        size[i] = [1.2, 1.8, 2.6][layer] * (0.7 + rnd() * 0.8);
        phase[i] = rnd();
        tone[i] = rnd();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
      geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
      geo.setAttribute("aTone", new THREE.BufferAttribute(tone, 1));
      const mat = new THREE.ShaderMaterial({
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG,
        transparent: true,
        depthTest: false,
        uniforms: {
          uShift: { value: new THREE.Vector2() },
          uPx: { value: 1 },
          uTime: { value: 0 },
          uTwinkle: { value: 1 },
        },
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      scene.add(pts);
      return { pts, mat };
    });

    // The transit: one bright star dims while a small dark disc crosses it.
    const featureGeo = new THREE.BufferGeometry();
    featureGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
    const starMat = new THREE.ShaderMaterial({
      vertexShader: FEATURE_VERT,
      fragmentShader: FEATURE_STAR_FRAG,
      transparent: true,
      depthTest: false,
      uniforms: { uPos: { value: new THREE.Vector2() }, uSize: { value: 12 }, uDim: { value: 1 } },
    });
    const discMat = new THREE.ShaderMaterial({
      vertexShader: FEATURE_VERT,
      fragmentShader: FEATURE_DISC_FRAG,
      transparent: true,
      depthTest: false,
      uniforms: { uPos: { value: new THREE.Vector2() }, uSize: { value: 6 }, uOn: { value: 0 } },
    });
    const featureStar = new THREE.Points(featureGeo, starMat);
    const featureDisc = new THREE.Points(featureGeo, discMat);
    featureStar.frustumCulled = false;
    featureDisc.frustumCulled = false;
    featureStar.visible = false;
    scene.add(featureStar, featureDisc);

    let w = 1;
    let h = 1;
    let px = 1;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      px = dpr * RENDER_SCALE;
      w = window.innerWidth;
      h = window.innerHeight;
      renderer.setPixelRatio(1);
      renderer.setSize(Math.max(1, Math.round(w * px)), Math.max(1, Math.round(h * px)), false);
      (nebula.material as THREE.ShaderMaterial).uniforms.uAspect.value = w / h;
      for (const l of layers) l.mat.uniforms.uPx.value = px;
      starMat.uniforms.uSize.value = 12 * px;
      discMat.uniforms.uSize.value = 6 * px;
      draw(lastTime);
    };

    const pointer = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    if (fine) window.addEventListener("pointermove", onPointer, { passive: true });

    // Transit scheduling: 20 to 40 s apart, only over a spot with no text.
    let transitStart = -1;
    let nextTransit = 8 + rnd() * 6; // seconds of animation time
    const pickSpot = (): boolean => {
      for (let i = 0; i < 12; i++) {
        const nx = rnd() * 1.7 - 0.85;
        const ny = rnd() * 1.7 - 0.85;
        const cx = ((nx + 1) / 2) * w;
        const cy = ((1 - ny) / 2) * h;
        if ([[0, 0], [-24, 0], [24, 0], [0, -24], [0, 24]].every(([dx, dy]) => isClearSpot(cx + dx, cy + dy))) {
          starMat.uniforms.uPos.value.set(nx, ny);
          return true;
        }
      }
      return false;
    };

    let lastTime = 0;
    function draw(t: number) {
      lastTime = t;
      // Mood crossfade.
      const k = Math.min(1, (performance.now() - moodAt.current) / MOOD_FADE_MS);
      mood.current.lerpVectors(moodFrom.current, target.current, k);
      (nebula.material as THREE.ShaderMaterial).uniforms.uTint.value.copy(mood.current);
      (nebula.material as THREE.ShaderMaterial).uniforms.uTime.value = t;

      // Parallax (fine pointers only), at most MAX_SHIFT_PX.
      const sx = ((fine ? pointer.x : 0) * MAX_SHIFT_PX) / (w / 2);
      const sy = ((fine ? -pointer.y : 0) * MAX_SHIFT_PX) / (h / 2);
      const scroll = fine ? Math.min(window.scrollY * 0.01, 6) / (h / 2) : 0;
      layers.forEach((l, i) => {
        l.mat.uniforms.uTime.value = t;
        l.mat.uniforms.uTwinkle.value = reduced ? 0 : 1;
        l.mat.uniforms.uShift.value.set(sx * LAYER_PARALLAX[i], (sy - scroll) * LAYER_PARALLAX[i]);
      });

      // Transit moment.
      if (!reduced) {
        if (transitStart < 0 && t >= nextTransit && pickSpot()) transitStart = t;
        if (transitStart >= 0) {
          const p = ((t - transitStart) * 1000) / TRANSIT_MS;
          if (p >= 1) {
            transitStart = -1;
            nextTransit = t + 20 + rnd() * 20;
            featureStar.visible = false;
            discMat.uniforms.uOn.value = 0;
          } else {
            const base = starMat.uniforms.uPos.value as THREE.Vector2;
            featureStar.visible = true;
            const bump = Math.exp(-Math.pow((p - 0.5) * 3.2, 2));
            starMat.uniforms.uDim.value = 1 - 0.55 * bump;
            const off = ((p - 0.5) * 16 * px) / (w / 2) * 1; // the disc crosses 16 css px
            discMat.uniforms.uPos.value.set(base.x + off, base.y);
            discMat.uniforms.uOn.value = 1;
          }
        } else {
          featureStar.visible = false;
        }
      } else {
        featureStar.visible = false;
        discMat.uniforms.uOn.value = 0;
      }
      renderer.render(scene, camera);
    }
    redraw.current = () => draw(lastTime);

    // Loop control.
    let raf = 0;
    let running = false;
    const t0 = performance.now();
    const frameGap = fine ? 0 : 1000 / 30; // phones draw at 30 fps
    let lastFrame = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - lastFrame < frameGap) return;
      lastFrame = now;
      draw((now - t0) / 1000);
    };
    const heavyOnScreen = () => {
      for (const n of document.querySelectorAll("[data-heavy-gl]")) {
        const r = n.getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight && r.width > 0 && r.height > 0) return true;
      }
      return false;
    };
    const sync = () => {
      const should = !reduced && !document.hidden && !heavyOnScreen();
      if (should && !running) {
        running = true;
        raf = requestAnimationFrame(frame);
        html.dataset.cosmos = "running";
      } else if (!should && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
      if (!running) {
        html.dataset.cosmos = reduced ? "still" : "paused";
        draw(reduced ? 12 : lastTime); // one still frame
      }
    };
    const poll = window.setInterval(sync, 1000);
    document.addEventListener("visibilitychange", sync);
    const onMotion = () => {
      reduced = motionQuery.matches;
      sync();
    };
    motionQuery.addEventListener("change", onMotion);
    window.addEventListener("resize", resize);
    const onLost = (e: Event) => {
      e.preventDefault();
      running = false;
      cancelAnimationFrame(raf);
      html.dataset.cosmos = "off";
    };
    el.addEventListener("webglcontextlost", onLost);

    html.classList.add("cosmos-on"); // hides the CSS stars this replaces
    resize();
    sync();

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", sync);
      motionQuery.removeEventListener("change", onMotion);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      el.removeEventListener("webglcontextlost", onLost);
      html.classList.remove("cosmos-on");
      delete html.dataset.cosmos;
      redraw.current = () => {};
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvas} className="cosmos-canvas" aria-hidden="true" data-testid="cosmos" />;
}
