/**
 * POST /api/cron/bt
 *
 * Recomputes per-language Bradley-Terry rankings from counted votes and writes
 * fresh `rankings` snapshot rows. Invoked by Cloud Scheduler with a shared
 * secret header (`x-cron-secret` === process.env.CRON_SECRET).
 *
 * Pipeline per language:
 *   1. Load counted votes joined to each side's system id (votes → pairs →
 *      samples → systems), shaped into VoteRow[] keyed by systemId.
 *   2. fitBT(votes, systemIds, bootstraps) — pure TypeScript, no Python.
 *   3. Insert one ranking row per system at a single `computedAt` timestamp.
 *      `rank` is null for any system with fewer than 250 counted votes.
 *
 * Returns { languagesUpdated }.
 */

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db/client";
import { pairs, samples, systems, votes, rankings } from "@/lib/db/schema";
import { fitBT, type VoteRow } from "@/lib/ranking/bt-mle";
import type { Verdict } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANK_THRESHOLD = 250;
const BOOTSTRAPS = 100;

export async function POST(request: Request): Promise<NextResponse> {
  // ---- Shared-secret auth ------------------------------------------
  const provided = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ---- Discover languages with counted votes -----------------------
  const langRows = await db
    .selectDistinct({ language: votes.language })
    .from(votes)
    .where(eq(votes.countsForRank, true));

  const languages = langRows.map((r) => r.language);
  const computedAt = new Date();
  let languagesUpdated = 0;

  for (const lang of languages) {
    const updated = await recomputeLanguage(lang, computedAt);
    if (updated) languagesUpdated += 1;
  }

  return NextResponse.json({ languagesUpdated });
}

/* ------------------------------------------------------------------ */
/* Per-language recompute                                              */
/* ------------------------------------------------------------------ */

async function recomputeLanguage(
  lang: string,
  computedAt: Date,
): Promise<boolean> {
  // Alias samples twice (A side / B side) for a single join over the pair.
  const sa = alias(samples, "sa");
  const sb = alias(samples, "sb");

  const rows = await db
    .select({
      systemA: sa.systemId,
      systemB: sb.systemId,
      verdict: votes.verdict,
      weight: votes.voteWeight,
    })
    .from(votes)
    .innerJoin(pairs, eq(votes.pairId, pairs.id))
    .innerJoin(sa, eq(pairs.sampleAId, sa.id))
    .innerJoin(sb, eq(pairs.sampleBId, sb.id))
    .where(
      and(eq(votes.language, lang), eq(votes.countsForRank, true)),
    );

  if (rows.length === 0) return false;

  // Build VoteRow[] keyed by systemId; collect the participating systems.
  const voteRows: VoteRow[] = [];
  const systemIdSet = new Set<string>();
  for (const r of rows) {
    if (!r.systemA || !r.systemB || r.systemA === r.systemB) continue;
    systemIdSet.add(r.systemA);
    systemIdSet.add(r.systemB);
    voteRows.push({
      voiceA: r.systemA,
      voiceB: r.systemB,
      verdict: r.verdict as Verdict,
      weight: r.weight ?? 1.0,
    });
  }

  const systemIds = [...systemIdSet];
  if (systemIds.length === 0 || voteRows.length === 0) return false;

  // ---- Fit Bradley-Terry (pure TS) ---------------------------------
  const scores = fitBT(voteRows, systemIds, BOOTSTRAPS);

  // Sort by btScore desc to assign ranks; null rank when under threshold.
  const ordered = [...scores].sort((a, b) => b.btScore - a.btScore);
  let nextRank = 0;
  const rankBySystem = new Map<string, number | null>();
  for (const s of ordered) {
    if (s.voteCount >= RANK_THRESHOLD) {
      nextRank += 1;
      rankBySystem.set(s.voiceId, nextRank);
    } else {
      rankBySystem.set(s.voiceId, null);
    }
  }

  // ---- Write the snapshot rows -------------------------------------
  const values = scores.map((s) => ({
    systemId: s.voiceId,
    language: lang,
    btScore: s.btScore,
    btLo: s.btLo,
    btHi: s.btHi,
    rank: rankBySystem.get(s.voiceId) ?? null,
    voteCount: s.voteCount,
    computedAt,
  }));

  if (values.length > 0) {
    await db.insert(rankings).values(values);
  }

  return true;
}
