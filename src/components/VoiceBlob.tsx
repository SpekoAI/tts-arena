"use client";

/**
 * VoiceBlob — a small, soft, organic blob that constantly morphs and pulses
 * with the voice. No 3D / shader "tech" look: just a soft gradient that wobbles
 * (animated border-radius) and scales with the live audio level. Each voice
 * gets its own two-color gradient. Lightweight — no WebGL.
 */

import { useEffect, useRef } from "react";

export default function VoiceBlob({
  analyser,
  from = "#93C5FD",
  to = "#2563EB",
  className = "",
}: {
  analyser?: AnalyserNode | null;
  from?: string;
  to?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const analyserRef = useRef<AnalyserNode | null | undefined>(analyser);
  analyserRef.current = analyser;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const freq = new Uint8Array(1024);
    let level = 0;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const a = analyserRef.current;
      let target = 0.06;
      if (a) {
        a.getByteFrequencyData(freq);
        const bins = Math.min(a.frequencyBinCount, freq.length);
        let s = 0;
        for (let i = 0; i < bins; i++) s += freq[i];
        target = bins > 0 ? s / bins / 255 : 0;
      }
      level += (target - level) * 0.2;
      el.style.setProperty("--lvl", level.toFixed(3));
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className={`voice-blob ${className}`}
      style={{ "--from": from, "--to": to } as React.CSSProperties}
    />
  );
}
