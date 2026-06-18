import Link from "next/link";
import Icon, { type IconName } from "@/components/Icon";
import ProviderMark from "@/components/ProviderMark";
import VotingArena from "@/components/VotingArena";
import EmailGate from "@/components/EmailGate";
import PixelWave from "@/components/PixelWave";
import AnimatedBar from "@/components/AnimatedBar";
import { getArenaStats, getLeaderboardRows } from "@/lib/server-data";
import { CATEGORIES, DEFAULT_LANG, type LeaderboardRow } from "@/lib/types";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function LbRow({ row }: { row: LeaderboardRow }) {
  const isHuman = row.isHuman;
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${isHuman ? "bg-human-soft" : ""}`}>
      <div className="grid w-4 shrink-0 place-items-center text-center">
        <span className="num text-[13px] text-ink-muted">
          {isHuman ? "·" : (row.rank ?? "—")}
        </span>
      </div>
      <ProviderMark vendor={row.vendor} isHuman={isHuman} className="h-7 w-7 text-[11px]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="whitespace-nowrap text-sm font-medium text-ink">
            {isHuman ? "Human" : row.vendor}
          </span>
          <span className="truncate text-[13px] text-ink-muted">
            {isHuman ? "reference" : row.modelName}
          </span>
        </div>
        <div className="mt-1.5">
          <AnimatedBar value={row.humanness} human={isHuman} />
        </div>
      </div>
      <div className="w-9 shrink-0 text-right">
        <span className={`num text-[15px] font-medium ${isHuman ? "text-human-deep" : "text-ink"}`}>
          {Math.round(row.humanness)}
        </span>
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-hair bg-card px-5 py-5 text-center">
      <div className="num text-2xl font-semibold text-ink sm:text-3xl">{value}</div>
      <div className="mt-1 text-[13px] text-ink-muted">{label}</div>
    </div>
  );
}

const STEPS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "headphones",
    title: "Listen, blind",
    body: "Two anonymous voices read the same line — no names, no logos, only audio.",
  },
  {
    icon: "check-circle",
    title: "Pick the human",
    body: "Choose the one that sounds more human. About one round in four hides a real person.",
  },
  {
    icon: "chart",
    title: "See the ranking",
    body: "Each vote feeds a Bradley-Terry model with 95% intervals, anchored to a real human.",
  },
];

const CAT_ICON: Record<string, IconName> = {
  conversational: "message",
  news: "broadcast",
  narration: "book",
  hard: "globe",
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default async function HomePage() {
  const [rows, stats] = await Promise.all([
    getLeaderboardRows(DEFAULT_LANG),
    getArenaStats(),
  ]);

  const human = rows.find((r) => r.isHuman);
  const contestants = rows
    .filter((r) => !r.isHuman)
    .sort((a, b) => b.humanness - a.humanness);
  const previewRows = [
    ...(human ? [human] : []),
    ...contestants.filter((r) => !r.isProvisional).slice(0, 6),
  ];

  const categoryWinners = CATEGORIES.map((c) => {
    let best: { row: LeaderboardRow; score: number } | null = null;
    for (const r of contestants) {
      const cat = r.categories?.find((x) => x.category === c.key);
      if (!cat) continue;
      if (!best || cat.humanness > best.score) best = { row: r, score: cat.humanness };
    }
    return { category: c, winner: best };
  });

  const foolPct = Math.round(stats.aiFoolRate * 100);

  return (
    <div>
      {/* ----------------------------------------------- Hero + arena */}
      <section id="arena" className="mx-auto max-w-3xl scroll-mt-20 px-5 pb-10 pt-12 sm:px-8 sm:pt-16">
        <div className="text-center">
          <span className="chip animate-fade">
            <span className="live-dot" />
            <span className="num">{stats.totalVotes.toLocaleString()}</span> blind
            votes &amp; counting
          </span>
          <h1 className="mx-auto mt-5 max-w-2xl animate-rise text-balance text-4xl font-bold leading-[1.06] tracking-tightest text-ink sm:text-5xl">
            Which voice sounds{" "}
            <span className="text-accent">most&nbsp;human</span>?
          </h1>
          <p className="mx-auto mt-4 max-w-lg animate-rise text-pretty text-[17px] leading-relaxed text-ink-soft">
            Play both clips, pick the one that sounds more natural. One in four
            rounds hides a real person — can you tell?
          </p>
        </div>

        <div className="mt-8 animate-rise">
          <VotingArena lang={DEFAULT_LANG} />
        </div>

        <p className="mt-4 text-center text-[13px] text-ink-muted">
          Anonymous · no account · today the best AI fools{" "}
          <span className="font-semibold text-ink">{foolPct}%</span> of listeners.
        </p>
      </section>

      {/* --------------------------------------------------------- Stats */}
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric value={stats.totalVotes.toLocaleString()} label="blind votes" />
          <Metric value={String(stats.systems)} label="voices ranked" />
          <Metric value={`${foolPct}%`} label="fooled by the best AI" />
          <Metric value={String(stats.languages)} label="languages" />
        </div>
      </section>

      {/* ---------------------------------------------------- Leaderboard preview */}
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="label">The leaderboard</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              The line every voice is chasing
            </h2>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-soft">
              Humanness runs 0–100. The human sits at 100; an AI reaches it only
              when listeners can no longer tell them apart.
            </p>
            <Link
              href="/leaderboard"
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-hover"
            >
              View the full leaderboard <Icon name="arrow-right" />
            </Link>
          </div>
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-hair px-4 py-3">
              <span className="label">Humanness · English</span>
              <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                <span className="live-dot" /> live
              </span>
            </div>
            <div className="divide-y divide-hair">
              {previewRows.map((r) => (
                <LbRow key={r.systemId} row={r} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- How it works */}
      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <p className="label">How it works</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Ten seconds a round. Real statistics underneath.
        </h2>
        <div className="mt-9 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="card p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-xl text-accent">
                  <Icon name={s.icon} />
                </span>
                <span className="num text-sm text-ink-faint">0{i + 1}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-ink">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------- Best for X */}
      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label">By use case</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              The right voice for the job
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-soft">
              Naturalness isn&apos;t one number. Each voice is tested across
              different kinds of speech — here&apos;s who leads each.
            </p>
          </div>
          <Link
            href="/leaderboard"
            className="text-sm font-semibold text-accent hover:text-accent-hover"
          >
            Compare all voices →
          </Link>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categoryWinners.map(({ category, winner }) => (
            <div key={category.key} className="card flex flex-col p-5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-xl text-accent">
                <Icon name={CAT_ICON[category.key]} />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold text-ink">
                {category.label}
              </h3>
              <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-ink-muted">
                {category.blurb}
              </p>
              {winner && (
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-hair pt-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <ProviderMark
                      vendor={winner.row.vendor}
                      className="h-6 w-6 text-[10px]"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink">
                        {winner.row.vendor}
                      </div>
                      <div className="truncate text-xs text-ink-muted">
                        {winner.row.modelName}
                      </div>
                    </div>
                  </div>
                  <span className="num text-lg font-semibold text-ink">
                    {Math.round(winner.score)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------- Report capture */}
      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <p className="label">Free report</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Take the whole picture with you
            </h2>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-soft">
              The complete methodology, every voice with its per-category
              breakdown, and the naturalness-vs-latency dataset — straight to
              your inbox, updated as the ranking moves.
            </p>
          </div>
          <EmailGate>
            <div className="card p-8 text-center">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent">
                <Icon name="check" className="text-xl" />
              </span>
              <h3 className="mt-3 text-lg font-bold text-ink">You&apos;re in.</h3>
              <p className="mt-1.5 text-[14px] text-ink-soft">
                The report is on its way. In the meantime:
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <Link
                  href="/methodology"
                  className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
                >
                  Read the methodology
                </Link>
                <Link
                  href="/leaderboard"
                  className="rounded-full border border-hair-strong bg-card px-5 py-2.5 text-sm font-semibold text-ink hover:border-ink/25"
                >
                  See the leaderboard
                </Link>
              </div>
            </div>
          </EmailGate>
        </div>
      </section>

      {/* ---------------------------------------------------- Final CTA */}
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="relative overflow-hidden rounded-4xl bg-ink px-6 py-14 text-center sm:py-16">
          <div
            className="pointer-events-none absolute inset-0 opacity-90"
            style={{
              background:
                "radial-gradient(38rem 18rem at 50% 120%, rgba(96,165,250,0.22), transparent 70%)",
            }}
          />
          <div className="relative">
            <p className="text-[11px] font-semibold uppercase tracking-label text-accent-glow">
              The arena
            </p>
            <h2 className="mx-auto mt-3 max-w-xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Think you can tell human from machine?
            </h2>
            <div className="mx-auto mt-8 max-w-xl">
              <PixelWave className="h-20 w-full sm:h-24" colorBright="#7DD3FC" colorDim="#2563EB" />
            </div>
            <p className="mx-auto mt-7 max-w-md text-[15px] text-white/60">
              It takes ten seconds a round. Your ears help rank every voice in
              the arena.
            </p>
            <Link
              href="/#arena"
              className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-base font-semibold text-ink transition-transform hover:-translate-y-0.5"
            >
              Play a round <Icon name="arrow-right" className="text-lg" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
