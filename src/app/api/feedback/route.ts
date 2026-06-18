/**
 * POST /api/feedback
 *
 * Records an optional post-vote failure-mode tag (robotic / mispronounced /
 * off pacing / wrong emotion / glitch) against a voice. This turns a blind
 * preference into a per-voice weakness signal.
 *
 * Frontend-complete: validates and accepts. In demo it logs; with a database
 * it would write to a `vote_reasons` table keyed on the pair + system so the
 * leaderboard can show each voice's most common gripes. (Wiring is the TODO.)
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REASONS = new Set(["robotic", "mispronounced", "pacing", "emotion", "glitch"]);

export async function POST(request: Request): Promise<NextResponse> {
  let body: { pairId?: unknown; systemId?: unknown; reason?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason : "";
  if (!REASONS.has(reason)) {
    return NextResponse.json({ error: "invalid_reason" }, { status: 400 });
  }

  const pairId = typeof body.pairId === "string" ? body.pairId : "";
  const systemId = typeof body.systemId === "string" ? body.systemId : null;

  // TODO: persist (vote_reasons table) so weaknesses aggregate per voice.
  console.log("[feedback]", { pairId, systemId, reason });

  return NextResponse.json({ ok: true });
}
