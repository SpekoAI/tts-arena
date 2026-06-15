/**
 * Self-contained DEMO MODE — lets the whole arena run with NO database and NO
 * cloud audio, so the UX can be demonstrated locally.
 *
 * Activated by `DEMO_MODE=1`. When on, the API routes short-circuit to the
 * functions here instead of touching Postgres. Audio is served from
 * `public/demo/*.mp3` (two macOS `say` voices reading identical prompts).
 *
 * NONE of this is on the production path: every consumer guards on
 * {@link DEMO_MODE}, which is false unless the env var is explicitly set.
 */

import type { LeaderboardRow, PairResponse, VoteResult } from "@/lib/types";

export const DEMO_MODE = process.env.DEMO_MODE === "1";

/** Prompts that match the locally generated clips in public/demo/. */
const PROMPTS = [
  "The early morning train glided quietly through the misty valley.",
  "Could you please confirm your appointment for next Tuesday at three?",
  "Honestly, I didn't expect the show to be that good — but it really was.",
];

type DemoVoice = "Samantha" | "Daniel";

/** The two demo "systems", labelled honestly as the local macOS voices. */
const SYSTEM: Record<DemoVoice, { vendor: string; modelName: string }> = {
  Samantha: { vendor: "macOS say", modelName: "Samantha" },
  Daniel: { vendor: "macOS say", modelName: "Daniel" },
};

function clip(idx: number, voice: DemoVoice): string {
  return `/demo/p${idx}_${voice}.mp3`;
}

/**
 * A blind demo pair. `pairId` encodes the prompt index and which voice is on
 * side A (`demo:<idx>:<voiceA>`) so the vote route can reveal correctly without
 * any stored state.
 */
export function demoPair(lang: string): PairResponse {
  const idx = Math.floor(Math.random() * PROMPTS.length);
  const aIsSamantha = Math.random() < 0.5;
  const aVoice: DemoVoice = aIsSamantha ? "Samantha" : "Daniel";
  const bVoice: DemoVoice = aIsSamantha ? "Daniel" : "Samantha";

  return {
    pairId: `demo:${idx}:${aVoice}`,
    promptText: PROMPTS[idx],
    language: lang,
    isGold: false,
    a: { sampleId: `demo-a-${idx}`, audioUrl: clip(idx, aVoice) },
    b: { sampleId: `demo-b-${idx}`, audioUrl: clip(idx, bVoice) },
  };
}

/** Decode a demo pairId back into the A/B identities for the post-vote reveal. */
export function demoReveal(pairId: string): VoteResult["reveal"] {
  const aVoice: DemoVoice = pairId.split(":")[2] === "Daniel" ? "Daniel" : "Samantha";
  const bVoice: DemoVoice = aVoice === "Samantha" ? "Daniel" : "Samantha";
  return { a: SYSTEM[aVoice], b: SYSTEM[bVoice] };
}

/**
 * Illustrative leaderboard so the ranking + confidence-interval bars + the
 * provisional state are all visible. Values are made up for the demo — a
 * banner in the UI says so.
 */
export function demoLeaderboard(_lang: string): LeaderboardRow[] {
  const raw: Array<{
    systemId: string;
    vendor: string;
    modelName: string;
    voiceLabel: string | null;
    btScore: number;
    ci: number;
    voteCount: number;
  }> = [
    { systemId: "d1", vendor: "Acme Voice", modelName: "Aria-2", voiceLabel: "native", btScore: 1574, ci: 23, voteCount: 2104 },
    { systemId: "d2", vendor: "Northwind", modelName: "Lyric", voiceLabel: "native", btScore: 1551, ci: 29, voteCount: 1486 },
    { systemId: "d3", vendor: "macOS say", modelName: "Samantha", voiceLabel: null, btScore: 1503, ci: 26, voteCount: 1772 },
    { systemId: "d4", vendor: "macOS say", modelName: "Daniel", voiceLabel: null, btScore: 1458, ci: 31, voteCount: 1190 },
    { systemId: "d5", vendor: "Polyphone", modelName: "Sonata", voiceLabel: "preview", btScore: 1489, ci: 58, voteCount: 214 },
  ];

  // Sort by score; only non-provisional rows get a numeric rank.
  raw.sort((x, y) => y.btScore - x.btScore);
  let nextRank = 1;
  return raw.map((r) => {
    const isProvisional = r.voteCount < 250;
    return {
      systemId: r.systemId,
      vendor: r.vendor,
      modelName: r.modelName,
      voiceLabel: r.voiceLabel,
      btScore: r.btScore,
      btLo: r.btScore - r.ci,
      btHi: r.btScore + r.ci,
      rank: isProvisional ? null : nextRank++,
      voteCount: r.voteCount,
      isProvisional,
    };
  });
}
