"use client";

/**
 * AnimatedBar — a humanness bar that grows from 0 to its value the first time
 * it scrolls into view. Each bar observes itself, so a list of them animates in
 * as a natural cascade. Respects reduced-motion via the global CSS guard.
 */

import { useEffect, useRef, useState } from "react";

export default function AnimatedBar({
  value,
  human = false,
  className = "",
}: {
  value: number;
  human?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const pct = Math.max(2, Math.min(100, value));
  return (
    <div ref={ref} className={`h-1.5 w-full overflow-hidden rounded-full bg-hair ${className}`}>
      <div
        className={`h-full rounded-full transition-[width] duration-700 ease-out ${
          human ? "bg-human" : "bg-accent"
        }`}
        style={{ width: shown ? `${pct}%` : "0%" }}
      />
    </div>
  );
}
