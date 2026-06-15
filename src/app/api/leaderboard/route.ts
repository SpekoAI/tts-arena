/**
 * GET /api/leaderboard?lang=<code>
 *
 * Returns the latest Bradley-Terry snapshot for a language as LeaderboardRow[],
 * sorted by btScore descending. A row is `isProvisional` when it has fewer than
 * 250 counted votes (too few to trust).
 *
 * "Latest" = the most recent `computedAt` for the language; we read every
 * ranking row at that timestamp and join system metadata for display.
 */

import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { rankings, systems } from "@/lib/db/schema";
import { getLang, type LeaderboardRow } from "@/lib/types";
import { DEMO_MODE, demoLeaderboard } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVISIONAL_THRESHOLD = 250;

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang")?.trim().toLowerCase() ?? "";

  if (!lang || !getLang(lang)) {
    return NextResponse.json(
      { error: "unknown_or_missing_language" },
      { status: 400 },
    );
  }

  if (DEMO_MODE) {
    return NextResponse.json(demoLeaderboard(lang), {
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Find the most recent snapshot timestamp for this language.
  const latest = await db
    .select({ computedAt: rankings.computedAt })
    .from(rankings)
    .where(eq(rankings.language, lang))
    .orderBy(desc(rankings.computedAt))
    .limit(1);

  if (latest.length === 0) {
    // No snapshot yet — empty leaderboard is a valid 200 response.
    return NextResponse.json([] as LeaderboardRow[], {
      headers: { "Cache-Control": "no-store" },
    });
  }

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
    })
    .from(rankings)
    .innerJoin(systems, eq(rankings.systemId, systems.id))
    .where(
      and(
        eq(rankings.language, lang),
        eq(rankings.computedAt, computedAt),
      ),
    )
    .orderBy(desc(rankings.btScore));

  const body: LeaderboardRow[] = rows.map((r) => ({
    systemId: r.systemId,
    vendor: r.vendor,
    modelName: r.modelName,
    voiceLabel: r.voiceLabel,
    btScore: r.btScore,
    btLo: r.btLo,
    btHi: r.btHi,
    rank: r.rank,
    voteCount: r.voteCount,
    isProvisional: r.voteCount < PROVISIONAL_THRESHOLD,
  }));

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
