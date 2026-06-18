"use client";

/**
 * LeaderboardView — the enhanced, distinctly-ours leaderboard.
 *
 * Subgroup tabs (Overall + each prompt category) re-rank the whole table live.
 * Below it: per-voice radar "fingerprints" across categories, and a
 * speed-vs-naturalness scatter anchored to the human baseline. Hand-built SVG
 * charts — no charting library, so the look is our own.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import ProviderMark from "./ProviderMark";
import AnimatedBar from "./AnimatedBar";
import { CATEGORIES, type LeaderboardRow, type PromptCategory } from "@/lib/types";

/** Fires once when the referenced element first scrolls into view. */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, inView] as const;
}

type Tab = "overall" | PromptCategory;

const TABS: { key: Tab; label: string }[] = [
  { key: "overall", label: "Overall" },
  ...CATEGORIES.map((c) => ({ key: c.key as Tab, label: c.label })),
];

function scoreFor(row: LeaderboardRow, tab: Tab): number {
  if (tab === "overall") return row.humanness;
  const c = row.categories?.find((x) => x.category === tab);
  return c ? c.humanness : row.humanness;
}

/* --------------------------------- Radar -------------------------------- */

function Radar({ row, shown }: { row: LeaderboardRow; shown: boolean }) {
  const cats = CATEGORIES;
  const cx = 90;
  const cy = 84;
  const r = 58;
  const pt = (i: number, val: number) => {
    const ang = -Math.PI / 2 + (i / cats.length) * Math.PI * 2;
    const rad = (val / 100) * r;
    return [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad];
  };
  const vals = cats.map((c) => row.categories?.find((x) => x.category === c.key)?.humanness ?? 0);
  const poly = vals.map((v, i) => pt(i, v).join(",")).join(" ");
  const rings = [25, 50, 75, 100];
  return (
    <svg viewBox="0 0 180 168" className="w-full">
      {rings.map((ring) => (
        <polygon
          key={ring}
          points={cats
            .map((_, i) => pt(i, ring).join(","))
            .join(" ")}
          fill="none"
          stroke="#E8EBF1"
          strokeWidth={1}
        />
      ))}
      {cats.map((c, i) => {
        const [x, y] = pt(i, 100);
        const [lx, ly] = pt(i, 124);
        return (
          <g key={c.key}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="#E8EBF1" strokeWidth={1} />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="9.5"
              fill="#64748B"
            >
              {c.label.split(" ")[0]}
            </text>
          </g>
        );
      })}
      <polygon
        points={poly}
        fill="rgba(37,99,235,0.16)"
        stroke="#2563EB"
        strokeWidth={1.75}
        style={{
          transformOrigin: "90px 84px",
          transform: shown ? "scale(1)" : "scale(0.3)",
          opacity: shown ? 1 : 0,
          transition: "transform .7s cubic-bezier(.2,.7,.2,1), opacity .6s ease",
        }}
      />
      {vals.map((v, i) => {
        const [x, y] = pt(i, v);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={2.5}
            fill="#2563EB"
            style={{
              opacity: shown ? 1 : 0,
              transition: `opacity .4s ease ${300 + i * 90}ms`,
            }}
          />
        );
      })}
    </svg>
  );
}

/* -------------------------------- Scatter ------------------------------- */

function Scatter({ rows, shown }: { rows: LeaderboardRow[]; shown: boolean }) {
  const W = 640;
  const H = 340;
  const pad = { l: 48, r: 20, t: 24, b: 44 };
  const pts = rows.filter((r) => !r.isHuman && typeof r.latencyMs === "number");
  const maxLat = Math.max(480, ...pts.map((r) => r.latencyMs ?? 0));
  const yMin = 60;
  const yMax = 100;
  const x = (lat: number) => pad.l + (lat / maxLat) * (W - pad.l - pad.r);
  const y = (hum: number) =>
    pad.t + (1 - (hum - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);

  const yTicks = [60, 70, 80, 90, 100];
  const xTicks = [0, 120, 240, 360, 480];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={pad.l} y1={y(t)} x2={W - pad.r} y2={y(t)} stroke="#EEF1F6" strokeWidth={1} />
          <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#94A3B8">
            {t}
          </text>
        </g>
      ))}
      {/* human baseline */}
      <line
        x1={pad.l}
        y1={y(100)}
        x2={W - pad.r}
        y2={y(100)}
        stroke="#E0930F"
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />
      <text x={W - pad.r} y={y(100) - 6} textAnchor="end" fontSize="11" fill="#B45309">
        Human · 100
      </text>
      {xTicks.map((t) => (
        <text key={t} x={x(t)} y={H - pad.b + 18} textAnchor="middle" fontSize="11" fill="#94A3B8">
          {t}
        </text>
      ))}
      <text x={(W + pad.l) / 2} y={H - 6} textAnchor="middle" fontSize="11.5" fill="#64748B">
        Latency (ms) — faster is better →
      </text>
      {pts.map((r, i) => (
        <g
          key={r.systemId}
          style={{
            opacity: shown ? 1 : 0,
            transform: shown ? "translateY(0)" : "translateY(10px)",
            transition: `opacity .5s ease ${i * 55}ms, transform .5s cubic-bezier(.2,.7,.2,1) ${i * 55}ms`,
          }}
        >
          <circle cx={x(r.latencyMs ?? 0)} cy={y(r.humanness)} r={5.5} fill="#2563EB" fillOpacity={0.9} />
          <text
            x={x(r.latencyMs ?? 0)}
            y={y(r.humanness) - 9}
            textAnchor="middle"
            fontSize="10.5"
            fill="#475569"
          >
            {r.vendor}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* --------------------------------- View --------------------------------- */

export default function LeaderboardView({ rows }: { rows: LeaderboardRow[] }) {
  const [tab, setTab] = useState<Tab>("overall");
  const [radarRef, radarShown] = useInView<HTMLDivElement>();
  const [scatterRef, scatterShown] = useInView<HTMLDivElement>();

  const { human, ranked } = useMemo(() => {
    const human = rows.find((r) => r.isHuman) ?? null;
    const ranked = rows
      .filter((r) => !r.isHuman)
      .map((r) => ({ row: r, score: scoreFor(r, tab) }))
      .sort((a, b) => b.score - a.score);
    return { human, ranked };
  }, [rows, tab]);

  const topForRadar = ranked.filter((r) => !r.row.isProvisional).slice(0, 3);

  return (
    <div>
      {/* tabs */}
      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-accent bg-accent text-white"
                : "border-hair bg-card text-ink-soft hover:border-hair-strong"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* table */}
      <div className="card mt-5 overflow-hidden">
        <div className="grid grid-cols-[2rem_1fr_5rem] items-center gap-3 border-b border-hair px-4 py-2.5 text-[11px] font-semibold uppercase tracking-label text-ink-muted sm:grid-cols-[2rem_1fr_8rem_5rem_5rem_4rem]">
          <span>#</span>
          <span>Voice</span>
          <span className="hidden sm:block">Latency</span>
          <span className="hidden sm:block">$ / min</span>
          <span className="hidden sm:block text-right">Votes</span>
          <span className="text-right">
            {tab === "overall" ? "Human%" : "Score"}
          </span>
        </div>

        {human && (
          <div className="grid grid-cols-[2rem_1fr_5rem] items-center gap-3 border-b border-hair bg-human-soft px-4 py-3 sm:grid-cols-[2rem_1fr_8rem_5rem_5rem_4rem]">
            <span className="num text-center text-[13px] text-ink-faint">·</span>
            <div className="flex min-w-0 items-center gap-2.5">
              <ProviderMark vendor="Human" isHuman className="h-7 w-7 text-[11px]" />
              <span className="text-sm font-semibold text-ink">
                Human <span className="text-ink-muted">reference</span>
              </span>
            </div>
            <span className="hidden text-[13px] text-ink-muted sm:block">—</span>
            <span className="hidden text-[13px] text-ink-muted sm:block">—</span>
            <span className="num hidden text-right text-[13px] text-ink-muted sm:block">
              {human.voteCount.toLocaleString()}
            </span>
            <span className="num text-right text-[15px] font-semibold text-human-deep">100</span>
          </div>
        )}

        {ranked.map(({ row, score }, i) => (
          <div
            key={row.systemId}
            className={`grid grid-cols-[2rem_1fr_5rem] items-center gap-3 border-b border-hair px-4 py-3 last:border-0 sm:grid-cols-[2rem_1fr_8rem_5rem_5rem_4rem] ${
              row.isProvisional ? "opacity-60" : ""
            }`}
          >
            <span className="num text-[13px] text-ink-muted">
              {row.isProvisional ? "—" : i + 1}
            </span>
            <div className="flex min-w-0 items-center gap-2.5">
              <ProviderMark vendor={row.vendor} className="h-7 w-7 text-[11px]" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="whitespace-nowrap text-sm font-medium text-ink">{row.vendor}</span>
                  <span className="truncate text-[13px] text-ink-muted">{row.modelName}</span>
                  {row.isOpenSource && (
                    <span className="rounded border border-hair px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                      open
                    </span>
                  )}
                  {row.isProvisional && (
                    <span className="rounded bg-canvas-deep px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                      provisional
                    </span>
                  )}
                </div>
                <div className="mt-1.5 max-w-[16rem]">
                  <AnimatedBar value={score} />
                </div>
              </div>
            </div>
            <span className="num hidden text-[13px] text-ink-soft sm:block">
              {row.latencyMs ? `${row.latencyMs}ms` : "—"}
            </span>
            <span className="num hidden text-[13px] text-ink-soft sm:block">
              {row.pricePerMinUsd === 0
                ? "free"
                : row.pricePerMinUsd
                  ? `$${row.pricePerMinUsd.toFixed(3)}`
                  : "—"}
            </span>
            <span className="num hidden text-right text-[13px] text-ink-muted sm:block">
              {row.voteCount.toLocaleString()}
            </span>
            <span className="num text-right text-[15px] font-semibold text-ink">
              {Math.round(score)}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[13px] text-ink-muted">
        Humanness is each voice&apos;s win/tie rate against a real human (100 =
        indistinguishable). Provisional voices have too few votes to rank.
      </p>

      {/* radar fingerprints */}
      <div className="mt-14">
        <p className="label">Voice fingerprints</p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Every voice has a shape
        </h2>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-soft">
          The same voice can ace conversation and fall apart on numbers and
          dates. Here&apos;s the top three, mapped across all four kinds of
          speech.
        </p>
        <div ref={radarRef} className="mt-6 grid gap-4 sm:grid-cols-3">
          {topForRadar.map(({ row }) => (
            <div key={row.systemId} className="card p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <ProviderMark vendor={row.vendor} className="h-8 w-8 text-[12px]" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{row.vendor}</div>
                    <div className="truncate text-xs text-ink-muted">{row.modelName}</div>
                  </div>
                </div>
                <span className="num text-lg font-semibold text-ink">
                  {Math.round(row.humanness)}
                </span>
              </div>
              <div className="mt-2">
                <Radar row={row} shown={radarShown} />
              </div>
              {row.detectability !== undefined && (
                <div
                  className="mt-1 flex items-center justify-between border-t border-hair pt-3 text-[12px]"
                  title="How well it holds up under scrutiny — from reaction time, replays and tie rate"
                >
                  <span className="text-ink-muted">Holds up under scrutiny</span>
                  <span className="num font-medium text-ink">
                    {row.detectability}
                    {row.judgeSec ? ` · ~${row.judgeSec}s` : ""}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* scatter */}
      <div className="mt-14">
        <p className="label">The tradeoff</p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Naturalness vs. speed
        </h2>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-soft">
          The most human voice isn&apos;t always the one you can ship in a live
          call. The closer to the dashed human line and the further left, the
          better the deal.
        </p>
        <div ref={scatterRef} className="card mt-6 p-4 sm:p-6">
          <Scatter rows={rows} shown={scatterShown} />
        </div>
      </div>
    </div>
  );
}
