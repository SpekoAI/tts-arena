/**
 * SpekoMark — Speko's current logo mark: a blue rounded square with white
 * horizontal bars (a stylized stacked-soundwave). Recreated from the live site;
 * drop the official SVG into public/brand/ to swap it. Self-contained, SSR-safe.
 */
export default function SpekoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#2563EB" />
      <g fill="#FFFFFF">
        <rect x="8" y="9.5" width="16" height="3" rx="1.5" />
        <rect x="8" y="14.5" width="11" height="3" rx="1.5" />
        <rect x="8" y="19.5" width="14" height="3" rx="1.5" />
      </g>
    </svg>
  );
}
