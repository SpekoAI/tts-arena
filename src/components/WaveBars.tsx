/**
 * WaveBars — the arena's audio-first identity motif.
 *
 * A row of bars shaped like a waveform/equalizer. Heights are deterministic
 * (derived from the bar index) so it renders identically on server and client
 * — no hydration mismatch — and it animates purely in CSS. When `playing` is
 * true the bars dance; otherwise they sit as a calm static waveform.
 */

type Tone = "accent" | "human" | "ink" | "paper" | "mixed";

const TONE: Record<Tone, string> = {
  accent: "bg-accent",
  human: "bg-human",
  ink: "bg-ink",
  paper: "bg-paper",
  mixed: "bg-accent",
};

/** A smooth, deterministic 0.28–1 height envelope across the bar row. */
function heightFor(i: number, n: number): number {
  const t = i / Math.max(1, n - 1);
  // Two overlaid sines give an organic, non-repeating-looking waveform.
  const a = Math.sin(t * Math.PI); // arch: tall in the middle
  const b = Math.sin(t * Math.PI * 7 + 0.6) * 0.5 + 0.5; // ripple
  const v = 0.28 + (a * 0.55 + b * 0.25);
  return Math.max(0.28, Math.min(1, v));
}

export default function WaveBars({
  bars = 28,
  tone = "accent",
  playing = true,
  className = "",
  barClassName = "",
}: {
  bars?: number;
  tone?: Tone;
  playing?: boolean;
  className?: string;
  /** Override per-bar look (width/rounding/color). */
  barClassName?: string;
}) {
  return (
    <div
      className={`flex h-full w-full items-center justify-center gap-[3px] ${className}`}
      aria-hidden
    >
      {Array.from({ length: bars }).map((_, i) => {
        const h = heightFor(i, bars);
        const mixedTone =
          tone === "mixed"
            ? i % 6 === 0
              ? "bg-human"
              : "bg-accent"
            : TONE[tone];
        return (
          <span
            key={i}
            className={`inline-block w-[3px] rounded-full ${mixedTone} ${
              playing ? "animate-eq" : ""
            } ${barClassName}`}
            style={{
              height: `${Math.round(h * 100)}%`,
              animationDelay: `${(i % 9) * 0.11}s`,
              transformOrigin: "center",
              opacity: 0.55 + h * 0.45,
            }}
          />
        );
      })}
    </div>
  );
}
