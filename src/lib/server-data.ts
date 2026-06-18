/**
 * Server-side data layer for the arena.
 *
 * One place that the API routes, the leaderboard page, and the landing page all
 * read from. It branches on {@link DEMO_MODE}: in demo it returns the
 * illustrative dataset; otherwise it queries Postgres. Keeping this behind a
 * single facade means the UI never has to know which mode it's in, and the
 * server components don't have to fetch their own API over HTTP.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { rankings, systems, votes } from "@/lib/db/schema";
import { DEMO_MODE, demoLeaderboard, demoStats } from "@/lib/demo";
import {
  humannessFromWinProb,
  winProbVsHuman,
  type ArenaStats,
  type LeaderboardRow,
} from "@/lib/types";

const PROVISIONAL_THRESHOLD = 250;

/** Is this system the designated real-human reference baseline? */
function isHumanSystem(vendor: string, systemId: string): boolean {
  return systemId === "human-ref" || vendor.trim().toLowerCase() === "human";
}

/**
 * Latest Bradley-Terry leaderboard for a language, enriched with humanness vs
 * the human reference. Returns [] when there is no snapshot yet.
 */
export async function getLeaderboardRows(
  lang: string,
): Promise<LeaderboardRow[]> {
  if (DEMO_MODE) return demoLeaderboard(lang);

  const latest = await db
    .select({ computedAt: rankings.computedAt })
    .from(rankings)
    .where(eq(rankings.language, lang))
    .orderBy(desc(rankings.computedAt))
    .limit(1);

  if (latest.length === 0) return [];
  const computedAt = latest[0].computedAt;

  const rows = await db
    .select({
      systemId: rankings.systemId,
      btScore: rankings.btScore,
      btLo: rankings.btLo,
      btHi: rankings.btHi,
      rank: rankings.rank,
      voteCount: rankings.voteCount,
      vendor: systems.vendor,
      modelName: systems.modelName,
      voiceLabel: systems.voiceLabel,
      isOpenSource: systems.isOpenSource,
    })
    .from(rankings)
    .innerJoin(systems, eq(rankings.systemId, systems.id))
    .where(and(eq(rankings.language, lang), eq(rankings.computedAt, computedAt)))
    .orderBy(desc(rankings.btScore));

  // The human reference anchors humanness; fall back to the top score if none
  // is present yet (so humanness is still a sane 0–100 relative measure).
  const human = rows.find((r) => isHumanSystem(r.vendor, r.systemId));
  const humanScore =
    human?.btScore ?? Math.max(1500, ...rows.map((r) => r.btScore));

  return rows.map((r) => {
    const human = isHumanSystem(r.vendor, r.systemId);
    const p = human ? 0.5 : winProbVsHuman(r.btScore, humanScore);
    return {
      systemId: r.systemId,
      vendor: r.vendor,
      modelName: r.modelName,
      voiceLabel: r.voiceLabel,
      isHuman: human,
      isOpenSource: r.isOpenSource,
      btScore: r.btScore,
      btLo: r.btLo,
      btHi: r.btHi,
      rank: r.rank,
      voteCount: r.voteCount,
      isProvisional: !human && r.voteCount < PROVISIONAL_THRESHOLD,
      humanness: human ? 100 : humannessFromWinProb(p),
      winRateVsHuman: p,
      // Per-category fingerprints + latency/price arrive with real seeding.
      latencyMs: null,
      pricePerMinUsd: null,
      categories: undefined,
      trend: undefined,
    };
  });
}

/** Headline stats for the landing "living arena" counters. */
export async function getArenaStats(): Promise<ArenaStats> {
  if (DEMO_MODE) return demoStats();

  const [voteAgg] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(votes)
    .where(eq(votes.countsForRank, true));

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [recentAgg] = await db
    .select({ recent: sql<number>`count(*)::int` })
    .from(votes)
    .where(gte(votes.createdAt, dayAgo));

  const [systemAgg] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(systems);

  const langAgg = await db
    .selectDistinct({ language: rankings.language })
    .from(rankings);

  return {
    totalVotes: voteAgg?.total ?? 0,
    systems: systemAgg?.n ?? 0,
    languages: langAgg.length,
    aiFoolRate: 0, // derived once human-reference head-to-heads are tallied.
    votesLast24h: recentAgg?.recent ?? 0,
  };
}
