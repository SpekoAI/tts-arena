/**
 * Horizontal Bradley-Terry confidence-interval bar.
 *
 * Renders the [lo, hi] interval as a track segment with the point estimate as
 * a tick, all positioned against a shared domain so multiple bars line up into
 * a forest-plot column. Pure presentational — no data fetching.
 */
export default function CIBar({
  score,
  lo,
  hi,
  domainMin,
  domainMax,
  muted = false,
}: {
  score: number;
  lo: number;
  hi: number;
  /** shared low end of the score axis across all rows. */
  domainMin: number;
  /** shared high end of the score axis across all rows. */
  domainMax: number;
  /** grey out provisional rows. */
  muted?: boolean;
}) {
  const span = Math.max(1e-6, domainMax - domainMin);
  const pct = (v: number) => ((v - domainMin) / span) * 100;

  const loPct = Math.max(0, Math.min(100, pct(lo)));
  const hiPct = Math.max(0, Math.min(100, pct(hi)));
  const scorePct = Math.max(0, Math.min(100, pct(score)));
  const widthPct = Math.max(0, hiPct - loPct);

  return (
    <div
      className="relative h-2.5 w-full rounded-full bg-neutral-800"
      title={`${score.toFixed(0)}  (95% CI ${lo.toFixed(0)}–${hi.toFixed(0)})`}
    >
      {/* CI range */}
      <div
        className={`absolute top-0 h-full rounded-full ${muted ? "bg-neutral-600" : "bg-accent-muted"}`}
        style={{ left: `${loPct}%`, width: `${widthPct}%` }}
      />
      {/* point estimate tick */}
      <div
        className={`absolute top-1/2 h-3.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full ${muted ? "bg-neutral-300" : "bg-accent-hover"}`}
        style={{ left: `${scorePct}%` }}
      />
    </div>
  );
}
