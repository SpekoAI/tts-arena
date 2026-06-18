/**
 * GET /api/leaderboard?lang=<code>
 *
 * Returns the latest leaderboard for a language as LeaderboardRow[], sorted by
 * btScore descending and enriched with humanness vs the human reference. The
 * data layer ({@link getLeaderboardRows}) handles demo-vs-database; this route
 * is the public HTTP surface for it.
 */

import { NextResponse } from "next/server";
import { getLeaderboardRows } from "@/lib/server-data";
import { getLang, type LeaderboardRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang")?.trim().toLowerCase() ?? "";

  if (!lang || !getLang(lang)) {
    return NextResponse.json(
      { error: "unknown_or_missing_language" },
      { status: 400 },
    );
  }

  const body: LeaderboardRow[] = await getLeaderboardRows(lang);
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
