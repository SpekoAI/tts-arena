import Link from "next/link";
import Icon from "@/components/Icon";
import LeaderboardView from "@/components/LeaderboardView";
import { getLeaderboardRows } from "@/lib/server-data";
import { DEFAULT_LANG } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const rows = await getLeaderboardRows(DEFAULT_LANG);

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
      <p className="label">Leaderboard · English</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight text-ink sm:text-5xl">
        Which AI voices sound most human
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
        Ranked by blind A/B votes with a Bradley-Terry model, measured against a
        real human baseline. Switch the subgroup to see who wins each kind of
        speech — most leaderboards only show one number.
      </p>
      <Link
        href="/methodology"
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-hover"
      >
        Read the methodology &amp; get the full 2026 report{" "}
        <Icon name="arrow-right" />
      </Link>

      {rows.length === 0 ? (
        <div className="card mt-8 p-10 text-center">
          <p className="text-ink">No rankings yet.</p>
          <p className="mt-2 text-sm text-ink-muted">
            Votes are still being collected.{" "}
            <Link href="/#arena" className="font-semibold text-accent hover:text-accent-hover">
              Cast some →
            </Link>
          </p>
        </div>
      ) : (
        <LeaderboardView rows={rows} />
      )}

      <div className="mt-14 flex flex-wrap items-center justify-between gap-4 rounded-4xl bg-ink px-8 py-10">
        <div>
          <h2 className="text-xl font-bold text-white sm:text-2xl">
            Help decide the ranking
          </h2>
          <p className="mt-1 text-[15px] text-white/60">
            Every blind vote sharpens these numbers.
          </p>
        </div>
        <Link
          href="/#arena"
          className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-white/90"
        >
          Play a round <Icon name="arrow-right" />
        </Link>
      </div>
    </div>
  );
}
