/**
 * POST /api/vote
 *
 * Records one anonymous blind vote and reveals the A/B identities.
 *
 * Server-trusted fields (never taken from the client):
 *   - anonId      ← `anon_id` cookie (minted on first vote if absent)
 *   - language    ← the pair's language (the BT leaderboard this counts toward)
 *   - declaredLang← the voter's `lang` cookie (for native-only filtering)
 *   - ipHash      ← SHA-256 of x-forwarded-for (raw IP never stored)
 *   - gold scoring← if the pair is gold, score the attempt and exclude from rank
 *
 * Anti-gaming: a dependency-free in-memory token bucket keyed on the IP hash
 * (falling back to the anon id) blunts naive vote floods on a warm instance.
 */

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pairs, samples, systems, goldPairs, votes } from "@/lib/db/schema";
import type { Verdict, VoteInput, VoteResult } from "@/lib/types";
import {
  clientIpFromForwardedFor,
  hashIp,
  rateLimit,
  scoreGoldAttempt,
} from "@/lib/anti-gaming";
import { ensureAnonId, readLang } from "@/lib/cookies";
import { DEMO_MODE, demoReveal } from "@/lib/demo";
import { realReveal } from "@/lib/samples";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_VERDICTS: ReadonlySet<string> = new Set(["a", "b", "tie"]);

export async function POST(request: Request): Promise<NextResponse> {
  let input: VoteInput;
  try {
    input = (await request.json()) as VoteInput;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const pairIdStr = String(input?.pairId ?? "");
  // Real synthesized pairs + demo both reveal without DB persistence (vote
  // storage + BT scoring land with the Neon database).
  if (pairIdStr.startsWith("real:") || DEMO_MODE) {
    const picked = VALID_VERDICTS.has(input?.verdict)
      ? (input.verdict as Verdict)
      : undefined;
    const reveal = pairIdStr.startsWith("real:")
      ? realReveal(pairIdStr, picked)
      : demoReveal(pairIdStr, picked);
    const result: VoteResult = { ok: true, reveal };
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  // ---- Validate the client payload ---------------------------------
  const pairIdNum = Number(input?.pairId);
  if (!Number.isInteger(pairIdNum) || pairIdNum <= 0) {
    return NextResponse.json({ error: "invalid_pair_id" }, { status: 400 });
  }
  if (!VALID_VERDICTS.has(input?.verdict)) {
    return NextResponse.json({ error: "invalid_verdict" }, { status: 400 });
  }
  const verdict = input.verdict as Verdict;

  // ---- Server-trusted identity + rate-limit ------------------------
  const { anonId } = await ensureAnonId();
  const declaredLang = await readLang();

  const ip = clientIpFromForwardedFor(request.headers.get("x-forwarded-for"));
  const ipHash = await hashIp(ip);
  const rlKey = ipHash ? ipHash.toString("hex") : anonId;

  const rl = rateLimit(rlKey, { capacity: 30, refillPerMinute: 30 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSec) },
      },
    );
  }

  // ---- Load the pair (language + sample ids) -----------------------
  const pairRows = await db
    .select({
      id: pairs.id,
      language: pairs.language,
      sampleAId: pairs.sampleAId,
      sampleBId: pairs.sampleBId,
    })
    .from(pairs)
    .where(eq(pairs.id, pairIdNum))
    .limit(1);

  const pair = pairRows[0];
  if (!pair) {
    return NextResponse.json({ error: "unknown_pair" }, { status: 404 });
  }

  // ---- Gold scoring ------------------------------------------------
  const goldRows = await db
    .select({ expected: goldPairs.expected })
    .from(goldPairs)
    .where(eq(goldPairs.pairId, pairIdNum))
    .limit(1);

  const isGoldAttempt = goldRows.length > 0;
  let goldCorrect: boolean | null = null;
  if (isGoldAttempt) {
    goldCorrect = scoreGoldAttempt(verdict, goldRows[0].expected as Verdict);
  }
  // Gold attempts never count toward the ranking.
  const countsForRank = !isGoldAttempt;

  // ---- Sanitize covariates -----------------------------------------
  const playedFirst =
    input.playedFirst === "a" || input.playedFirst === "b"
      ? input.playedFirst
      : null;
  const rtMs = clampInt(input.rtMs);
  const playedAMs = clampInt(input.playedAMs) ?? 0;
  const playedBMs = clampInt(input.playedBMs) ?? 0;
  const leftWasA = input.leftWasA === true;
  const turnstileOk = false; // v1: no Turnstile verification wired yet.

  // ---- Insert the vote ---------------------------------------------
  await db.insert(votes).values({
    anonId,
    pairId: pairIdNum,
    language: pair.language,
    declaredLang,
    verdict,
    rtMs: rtMs ?? null,
    playedAMs,
    playedBMs,
    leftWasA,
    playedFirst,
    ipHash,
    turnstileOk,
    isGoldAttempt,
    goldCorrect,
    countsForRank,
    voteWeight: 1.0,
  });

  // ---- Reveal the A/B identities -----------------------------------
  const reveal = await revealIdentities(pair.sampleAId, pair.sampleBId);

  const result: VoteResult = { ok: true, reveal };
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Coerce to a non-negative integer or undefined. */
function clampInt(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.round(n));
}

/**
 * Resolve the vendor/model behind sample A and sample B for the post-vote
 * reveal. Joins samples → systems.
 */
async function revealIdentities(
  sampleAId: number,
  sampleBId: number,
): Promise<VoteResult["reveal"]> {
  const rows = await db
    .select({
      sampleId: samples.id,
      vendor: systems.vendor,
      modelName: systems.modelName,
    })
    .from(samples)
    .innerJoin(systems, eq(samples.systemId, systems.id))
    .where(sql`${samples.id} IN (${sampleAId}, ${sampleBId})`);

  const byId = new Map(rows.map((r) => [r.sampleId, r]));
  const a = byId.get(sampleAId);
  const b = byId.get(sampleBId);

  return {
    a: { vendor: a?.vendor ?? "unknown", modelName: a?.modelName ?? "unknown" },
    b: { vendor: b?.vendor ?? "unknown", modelName: b?.modelName ?? "unknown" },
  };
}
