/**
 * PixelWave — a decorative pixel-grid sound waveform.
 *
 * Center-symmetric columns of small squares whose height follows a waveform —
 * it reads as an audio signal and echoes Speko's pixel-grid mark. Deterministic
 * (SSR-safe), inherits color via the `tone` fills. Purely decorative.
 */

const COLS = 60;
const ROWS = 16; // even; waveform is mirrored around the middle
const PITCH = 10;
const CELL = 7;

function ampFor(i: number): number {
  const env = Math.sin(((i + 0.5) / COLS) * Math.PI); // taper at both ends
  const wave =
    0.42 +
    0.34 * Math.abs(Math.sin(i * 0.46)) +
    0.24 * Math.abs(Math.cos(i * 0.17 + 0.6));
  return Math.max(1, Math.round(env * wave * (ROWS / 2)));
}

export default function PixelWave({
  className = "",
  colorBright = "#7cf2c8",
  colorDim = "#3f8f73",
}: {
  className?: string;
  colorBright?: string;
  colorDim?: string;
}) {
  const mid = ROWS / 2;
  const cells: { x: number; y: number; o: number; bright: boolean }[] = [];
  for (let i = 0; i < COLS; i++) {
    const amp = ampFor(i);
    for (let r = mid - amp; r < mid + amp; r++) {
      const distFromMid = Math.abs(r + 0.5 - mid) / amp; // 0 center → 1 edge
      const o = 0.35 + 0.65 * (1 - distFromMid);
      cells.push({ x: i * PITCH, y: r * PITCH, o, bright: distFromMid < 0.5 });
    }
  }
  return (
    <svg
      viewBox={`0 0 ${COLS * PITCH} ${ROWS * PITCH}`}
      className={className}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      {cells.map((c, idx) => (
        <rect
          key={idx}
          x={c.x}
          y={c.y}
          width={CELL}
          height={CELL}
          rx={1.6}
          fill={c.bright ? colorBright : colorDim}
          opacity={c.o}
        />
      ))}
    </svg>
  );
}
