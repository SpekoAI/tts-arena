"use client";

/**
 * VoiceSphere — a "tech-wave" voice orb: a glowing point-cloud over a faint
 * wireframe cage, displaced by audio-reactive noise. Each instance takes a
 * `seed` so two orbs on screen move independently (asynchronous). Light-bg
 * friendly (solid colored points with depth fade, no additive wash). Three.js,
 * bundled — no CDN.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute( permute( permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

const VERT = /* glsl */ `
uniform float uTime, uLevel, uSeed, uSize;
varying float vDepth;
varying float vDisp;
${NOISE}
void main(){
  float t = uTime + uSeed * 11.3;
  float n1 = snoise(position * 1.4 + vec3(uSeed, 0.0, t * 0.3));
  float n2 = snoise(position * 3.0 - vec3(t * 0.22, uSeed, 0.0));
  float disp = n1 * (0.09 + uLevel * 1.05) + n2 * (0.04 + uLevel * 0.5);
  vDisp = disp;
  vec3 p = position * (1.0 + disp);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  gl_PointSize = uSize * (1.0 + uLevel * 0.9) * (2.6 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const POINTS_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
varying float vDepth;
varying float vDisp;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.08, d);
  float front = clamp((4.7 - vDepth) / 2.3, 0.18, 1.0);
  vec3 col = uColor + max(vDisp, 0.0) * 0.7;   // brighten the ridges
  gl_FragColor = vec4(col, soft * front);
}
`;

const WIRE_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
varying float vDepth;
void main(){
  float front = clamp((4.7 - vDepth) / 2.3, 0.1, 1.0);
  gl_FragColor = vec4(uColor, 0.13 * front);
}
`;

export default function VoiceSphere({
  analyser,
  color = "#2563EB",
  seed = 0,
  className = "",
}: {
  analyser?: AnalyserNode | null;
  color?: string;
  seed?: number;
  className?: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const analyserRef = useRef<AnalyserNode | null | undefined>(analyser);
  analyserRef.current = analyser;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const sz = () => ({ w: mount.clientWidth || 200, h: mount.clientHeight || 200 });
    let { w, h } = sz();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
    camera.position.z = 3.1;

    const col = new THREE.Color(color);
    const mk = (extra: object) => ({
      uTime: { value: 0 },
      uLevel: { value: 0 },
      uSeed: { value: seed },
      uColor: { value: col },
      ...extra,
    });

    const group = new THREE.Group();
    group.rotation.y = seed;

    const ptsGeo = new THREE.IcosahedronGeometry(1, 5);
    const ptsU = mk({ uSize: { value: 2.0 * dpr } });
    const ptsMat = new THREE.ShaderMaterial({
      uniforms: ptsU,
      vertexShader: VERT,
      fragmentShader: POINTS_FRAG,
      transparent: true,
      depthWrite: false,
    });
    group.add(new THREE.Points(ptsGeo, ptsMat));

    const wireGeo = new THREE.IcosahedronGeometry(1, 3);
    const wireU = mk({ uSize: { value: 1 } });
    const wireMat = new THREE.ShaderMaterial({
      uniforms: wireU,
      vertexShader: VERT,
      fragmentShader: WIRE_FRAG,
      transparent: true,
      wireframe: true,
      depthWrite: false,
    });
    group.add(new THREE.Mesh(wireGeo, wireMat));
    scene.add(group);

    const freq = new Uint8Array(1024);
    let level = 0;
    let raf = 0;
    const clock = new THREE.Clock();
    const spin = 0.13 + (seed % 5) * 0.012; // per-orb spin speed → asynchronous

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      const a = analyserRef.current;
      let target = 0.05;
      if (a) {
        a.getByteFrequencyData(freq);
        const bins = Math.min(a.frequencyBinCount, freq.length);
        let s = 0;
        for (let i = 0; i < bins; i++) s += freq[i];
        target = bins > 0 ? s / bins / 255 : 0;
      }
      level += (target - level) * 0.22; // snappier → reacts to the voice
      ptsU.uTime.value = t;
      ptsU.uLevel.value = level;
      wireU.uTime.value = t;
      wireU.uLevel.value = level;
      group.rotation.y = seed + t * spin;
      group.rotation.x = Math.sin(t * 0.1 + seed) * 0.18;
      group.rotation.z = Math.sin(t * 1.8 + seed) * level * 0.3; // live wobble on audio
      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      const s = sz();
      w = s.w;
      h = s.h;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      ptsGeo.dispose();
      wireGeo.dispose();
      ptsMat.dispose();
      wireMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [color, seed]);

  return <div ref={mountRef} className={className} aria-hidden />;
}
