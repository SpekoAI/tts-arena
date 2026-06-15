/**
 * GET /api/pair?lang=<code>
 *
 * Serves a single blind A/B pair for the requested language. Vendor/model
 * identities are intentionally absent from the response — they are only
 * revealed by POST /api/vote after a vote lands.
 *
 * Selection policy:
 *   - 5% of the time, serve a gold (attention-check) pair for the language.
 *   - Otherwise, pick from the 50 least-served pairs and choose one at random,
 *     biasing coverage toward under-served pairs.
 *   - Either way, bump servedCount and stamp lastServedAt.
 */

import { NextResponse } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pairs, samples, goldPairs, prompts } from "@/lib/db/schema";
import { getLang, type PairResponse } from "@/lib/types";
import { DEMO_MODE, demoPair } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GOLD_PROBABILITY = 0.05;
const CANDIDATE_LIMIT = 50;

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
    return NextResponse.json(demoPair(lang), {
      headers: { "Cache-Control": "no-store" },
    });
  }

  // 5% gold injection — try a gold pair first; fall back to a normal pair if
  // none exist for this language.
  let chosenPairId: number | null = null;
  let isGold = false;

  if (Math.random() < GOLD_PROBABILITY) {
    chosenPairId = await pickGoldPairId(lang);
    isGold = chosenPairId !== null;
  }

  if (chosenPairId === null) {
    chosenPairId = await pickRegularPairId(lang);
  }

  if (chosenPairId === null) {
    return NextResponse.json(
      { error: "no_pairs_for_language" },
      { status: 404 },
    );
  }

  // Bump serve bookkeeping. Best-effort: a missed bump is harmless.
  await db
    .update(pairs)
    .set({
      servedCount: sql`${pairs.servedCount} + 1`,
      lastServedAt: new Date(),
    })
    .where(eq(pairs.id, chosenPairId));

  // Load the pair + its two samples' audio URLs (no system identity leaked).
  const pairRow = await db
    .select({
      id: pairs.id,
      language: pairs.language,
      sampleAId: pairs.sampleAId,
      sampleBId: pairs.sampleBId,
    })
    .from(pairs)
    .where(eq(pairs.id, chosenPairId))
    .limit(1);

  const pair = pairRow[0];
  if (!pair) {
    return NextResponse.json({ error: "pair_vanished" }, { status: 404 });
  }

  const sampleRows = await db
    .select({
      id: samples.id,
      audioUrl: samples.audioUrl,
      promptId: samples.promptId,
    })
    .from(samples)
    .where(
      sql`${samples.id} IN (${pair.sampleAId}, ${pair.sampleBId})`,
    );

  const byId = new Map(sampleRows.map((s) => [s.id, s]));
  const sampleA = byId.get(pair.sampleAId);
  const sampleB = byId.get(pair.sampleBId);

  if (!sampleA || !sampleB) {
    return NextResponse.json(
      { error: "pair_samples_missing" },
      { status: 500 },
    );
  }

  // Resolve the prompt text via either sample's promptId (both share it).
  const promptText = await loadPromptText(sampleA.promptId);

  const body: PairResponse = {
    pairId: String(pair.id),
    promptText,
    language: pair.language,
    isGold,
    a: { sampleId: String(sampleA.id), audioUrl: sampleA.audioUrl },
    b: { sampleId: String(sampleB.id), audioUrl: sampleB.audioUrl },
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Pick a random gold pair id for the language, or null if none exist. */
async function pickGoldPairId(lang: string): Promise<number | null> {
  const rows = await db
    .select({ pairId: goldPairs.pairId })
    .from(goldPairs)
    .innerJoin(pairs, eq(goldPairs.pairId, pairs.id))
    .where(eq(pairs.language, lang));

  if (rows.length === 0) return null;
  return rows[(Math.random() * rows.length) | 0].pairId;
}

/**
 * Pick a regular (non-gold) pair: take the 50 least-served pairs for the
 * language, then choose one uniformly at random among them. This spreads serves
 * toward under-covered pairs while still randomizing which voter sees what.
 */
async function pickRegularPairId(lang: string): Promise<number | null> {
  const candidates = await db
    .select({ id: pairs.id })
    .from(pairs)
    .where(eq(pairs.language, lang))
    .orderBy(asc(pairs.servedCount))
    .limit(CANDIDATE_LIMIT);

  if (candidates.length === 0) return null;
  return candidates[(Math.random() * candidates.length) | 0].id;
}

/** Load the prompt text for a sample's promptId. */
async function loadPromptText(promptId: number): Promise<string> {
  const rows = await db
    .select({ text: prompts.text })
    .from(prompts)
    .where(eq(prompts.id, promptId))
    .limit(1);
  return rows[0]?.text ?? "";
}
