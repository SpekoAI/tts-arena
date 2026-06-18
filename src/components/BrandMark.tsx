/**
 * BrandMark — the custom Speko × sound-wave logo glyph.
 *
 * A radial waveform: ticks of varying length arranged around a circle, so it
 * reads at once as a voice spectrogram and as the arena's voice-sphere motif,
 * in Speko's clean technical style. Deterministic (SSR-safe), inherits
 * `currentColor`, scales with font-size or width/height on the parent.
 */

const N = 28;
const CX = 20;
const CY = 20;
const INNER = 5.4;
const SPAN = 8.6;

function tick(i: number) {
  const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
  // Three gentle lobes around the circle → an organic, voice-like waveform.
  const w = 0.5 + 0.5 * Math.sin((i / N) * Math.PI * 2 * 3 + 0.4);
  const outer = INNER + 1.6 + w * SPAN;
  return {
    x1: CX + Math.cos(ang) * INNER,
    y1: CY + Math.sin(ang) * INNER,
    x2: CX + Math.cos(ang) * outer,
    y2: CY + Math.sin(ang) * outer,
  };
}

export default function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      className={className}
      aria-hidden="true"
    >
      <circle cx={CX} cy={CY} r={INNER - 1.4} fill="currentColor" stroke="none" opacity={0.9} />
      <g strokeWidth={1.7} strokeLinecap="round">
        {Array.from({ length: N }).map((_, i) => {
          const t = tick(i);
          return <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />;
        })}
      </g>
    </svg>
  );
}
