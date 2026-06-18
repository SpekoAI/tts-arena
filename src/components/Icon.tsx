/**
 * Tiny self-contained inline-SVG icon set. No webfont, no network — the preview
 * sandbox can't reach external CDNs, and we want icons that always render.
 *
 * Stroke icons inherit `currentColor`; size with font-size (icons are 1em) or a
 * width/height utility on the parent. Add `aria-hidden` by default (decorative).
 */

import type { ReactNode } from "react";

const STROKE: Record<string, ReactNode> = {
  "arrow-right": (
    <>
      <path d="M5 12h13" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  "arrow-left": (
    <>
      <path d="M19 12H6" />
      <path d="M11 6l-6 6 6 6" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="M8 11l4 4 4-4" />
      <path d="M5 19.5h14" />
    </>
  ),
  headphones: (
    <>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <rect x="3" y="13" width="4.5" height="7" rx="1.6" />
      <rect x="16.5" y="13" width="4.5" height="7" rx="1.6" />
    </>
  ),
  "check-circle": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.3 12.2l2.6 2.6 4.8-5.2" />
    </>
  ),
  chart: (
    <>
      <path d="M4 5v14h16" />
      <path d="M7.5 14l3.5-3.5 3 2 4-5" />
    </>
  ),
  message: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="3" />
      <path d="M8.5 17v3.2l4-3.2" />
    </>
  ),
  broadcast: (
    <>
      <circle cx="12" cy="12" r="2.4" />
      <path d="M8 8a5.5 5.5 0 0 0 0 8M16 8a5.5 5.5 0 0 1 0 8" />
      <path d="M5 5a9.5 9.5 0 0 0 0 14M19 5a9.5 9.5 0 0 1 0 14" />
    </>
  ),
  book: (
    <>
      <path d="M12 6c-1.6-1-4-1.5-6.2-1.5V18c2.2 0 4.6.5 6.2 1.5 1.6-1 4-1.5 6.2-1.5V4.5C16 4.5 13.6 5 12 6z" />
      <path d="M12 6v13.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </>
  ),
  "chart-dots": (
    <>
      <path d="M4 5v14h16" />
      <circle cx="9" cy="13.5" r="1.4" />
      <circle cx="13.5" cy="9.5" r="1.4" />
      <circle cx="18" cy="11.5" r="1.4" />
    </>
  ),
  scale: (
    <>
      <path d="M12 4v16M7.5 20h9M6 5.5h12" />
      <path d="M6 5.5l-3 6h6zM18 5.5l-3 6h6z" />
    </>
  ),
};

const FILLED: Record<string, ReactNode> = {
  star: (
    <path d="M12 3.2l2.65 5.7 6.25.62-4.7 4.18 1.35 6.1L12 16.75 6.45 19.8l1.35-6.1L3.1 9.52l6.25-.62z" />
  ),
  play: <path d="M8 5.2v13.6l11-6.8z" />,
  pause: (
    <>
      <rect x="6.5" y="5" width="3.6" height="14" rx="1.1" />
      <rect x="13.9" y="5" width="3.6" height="14" rx="1.1" />
    </>
  ),
};

export type IconName = keyof typeof STROKE | keyof typeof FILLED;

export default function Icon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  const filled = name in FILLED;
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {filled ? FILLED[name as keyof typeof FILLED] : STROKE[name as keyof typeof STROKE]}
    </svg>
  );
}
