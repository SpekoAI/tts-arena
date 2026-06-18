/**
 * Self-contained DEMO MODE — lets the whole arena run with NO database and NO
 * cloud audio, so the UX can be demonstrated locally.
 *
 * Activated by `DEMO_MODE=1`. When on, the API routes + server data layer
 * short-circuit to the functions here instead of touching Postgres. Voting
 * audio is served from `public/demo/*.mp3` (two macOS `say` voices reading
 * identical prompts); the leaderboard numbers are illustrative-but-plausible
 * English TTS results so the full product can be designed against real-looking
 * data. A banner in the UI says so.
 *
 * NONE of this is on the production path: every consumer guards on
 * {@link DEMO_MODE}, which is false unless the env var is explicitly set.
 */

import {
  CATEGORIES,
  humannessFromWinProb,
  winProbVsHuman,
  type ArenaStats,
  type CategoryScore,
  type LeaderboardRow,
  type PairResponse,
  type PromptCategory,
  type RevealSide,
  type Verdict,
  type VoteResult,
} from "@/lib/types";

export const DEMO_MODE = process.env.DEMO_MODE === "1";

/* ------------------------------------------------------------------ */
/* Leaderboard — illustrative English TTS humanness board              */
/* ------------------------------------------------------------------ */

/** The human reference's Bradley-Terry score — the north star at humanness 100. */
const HUMAN_SCORE = 1700;

interface RawSystem {
  systemId: string;
  vendor: string;
  modelName: string;
  voiceLabel: string | null;
  isHuman?: boolean;
  isOpenSource?: boolean;
  /** Overall humanness 0–100 (drives btScore vs the human reference). */
  humanness: number;
  /** Half-width of the 95% CI on the Elo scale (tighter with more votes). */
  ci: number;
  voteCount: number;
  latencyMs: number | null;
  pricePerMinUsd: number | null;
  /** Per-category humanness — the radar "fingerprint" and "best for X" story. */
  cat: Record<PromptCategory, number>;
  /** Signed change in humanness since the previous snapshot. */
  trend: number;
}

/**
 * Plausible 2026 English text-to-speech systems. Numbers are illustrative; the
 * fingerprints tell honest-feeling stories (e.g. low-latency voices that trade
 * a little expressiveness, open-source models punching above their size,
 * voices that fall apart on hard text full of numbers and abbreviations).
 */
const RAW: RawSystem[] = [
  {
    systemId: "human-ref",
    vendor: "Human",
    modelName: "reference recording",
    voiceLabel: "studio read",
    isHuman: true,
    humanness: 100,
    ci: 7,
    voteCount: 3142,
    latencyMs: null,
    pricePerMinUsd: null,
    cat: { conversational: 100, news: 100, narration: 100, hard: 100 },
    trend: 0,
  },
  {
    systemId: "elevenlabs-v3",
    vendor: "ElevenLabs",
    modelName: "Eleven v3",
    voiceLabel: "Jessica",
    humanness: 96,
    ci: 11,
    voteCount: 3088,
    latencyMs: 320,
    pricePerMinUsd: 0.18,
    cat: { conversational: 97, news: 96, narration: 98, hard: 90 },
    trend: 1.4,
  },
  {
    systemId: "hume-octave2",
    vendor: "Hume",
    modelName: "Octave 2",
    voiceLabel: "Ava",
    humanness: 94,
    ci: 13,
    voteCount: 2611,
    latencyMs: 450,
    pricePerMinUsd: 0.2,
    cat: { conversational: 97, news: 90, narration: 96, hard: 86 },
    trend: 2.1,
  },
  {
    systemId: "openai-4o-tts",
    vendor: "OpenAI",
    modelName: "gpt-4o-tts",
    voiceLabel: "Sol",
    humanness: 92,
    ci: 12,
    voteCount: 2890,
    latencyMs: 380,
    pricePerMinUsd: 0.015,
    cat: { conversational: 90, news: 94, narration: 90, hard: 93 },
    trend: 0.6,
  },
  {
    systemId: "cartesia-sonic3",
    vendor: "Cartesia",
    modelName: "Sonic-3",
    voiceLabel: "Brooke",
    humanness: 90,
    ci: 14,
    voteCount: 2304,
    latencyMs: 90,
    pricePerMinUsd: 0.025,
    cat: { conversational: 93, news: 90, narration: 85, hard: 88 },
    trend: 1.0,
  },
  {
    systemId: "minimax-speech02",
    vendor: "MiniMax",
    modelName: "Speech-02",
    voiceLabel: "Wise Woman",
    humanness: 88,
    ci: 16,
    voteCount: 1842,
    latencyMs: 410,
    pricePerMinUsd: 0.012,
    cat: { conversational: 88, news: 87, narration: 92, hard: 80 },
    trend: -0.4,
  },
  {
    systemId: "google-gemini-tts",
    vendor: "Google",
    modelName: "Gemini 2.5 TTS",
    voiceLabel: "Kore",
    humanness: 86,
    ci: 15,
    voteCount: 1990,
    latencyMs: 350,
    pricePerMinUsd: 0.016,
    cat: { conversational: 82, news: 92, narration: 86, hard: 88 },
    trend: 0.9,
  },
  {
    systemId: "playht-3",
    vendor: "PlayHT",
    modelName: "Play 3.0",
    voiceLabel: "Nova",
    humanness: 84,
    ci: 18,
    voteCount: 1456,
    latencyMs: 300,
    pricePerMinUsd: 0.03,
    cat: { conversational: 85, news: 84, narration: 85, hard: 80 },
    trend: -0.7,
  },
  {
    systemId: "rime-arcana",
    vendor: "Rime",
    modelName: "Arcana",
    voiceLabel: "Luna",
    humanness: 82,
    ci: 17,
    voteCount: 1322,
    latencyMs: 200,
    pricePerMinUsd: 0.022,
    cat: { conversational: 91, news: 78, narration: 75, hard: 80 },
    trend: 1.8,
  },
  {
    systemId: "azure-neural",
    vendor: "Microsoft",
    modelName: "Azure Neural",
    voiceLabel: "Aria",
    humanness: 78,
    ci: 16,
    voteCount: 1574,
    latencyMs: 280,
    pricePerMinUsd: 0.016,
    cat: { conversational: 72, news: 86, narration: 78, hard: 82 },
    trend: -0.3,
  },
  {
    systemId: "deepgram-aura2",
    vendor: "Deepgram",
    modelName: "Aura-2",
    voiceLabel: "Thalia",
    humanness: 74,
    ci: 19,
    voteCount: 1108,
    latencyMs: 150,
    pricePerMinUsd: 0.03,
    cat: { conversational: 82, news: 74, narration: 70, hard: 68 },
    trend: 0.4,
  },
  {
    systemId: "kokoro-82m",
    vendor: "Kokoro",
    modelName: "Kokoro 82M",
    voiceLabel: "af_heart",
    isOpenSource: true,
    humanness: 70,
    ci: 21,
    voteCount: 980,
    latencyMs: 120,
    pricePerMinUsd: 0,
    cat: { conversational: 72, news: 71, narration: 66, hard: 60 },
    trend: 2.6,
  },
  {
    systemId: "amazon-polly-gen",
    vendor: "Amazon",
    modelName: "Polly Generative",
    voiceLabel: "Ruth",
    humanness: 67,
    ci: 20,
    voteCount: 1036,
    latencyMs: 240,
    pricePerMinUsd: 0.016,
    cat: { conversational: 64, news: 76, narration: 70, hard: 72 },
    trend: -0.9,
  },
  {
    systemId: "sesame-csm",
    vendor: "Sesame",
    modelName: "CSM-1B",
    voiceLabel: "Maya (preview)",
    isOpenSource: true,
    humanness: 89,
    ci: 47,
    voteCount: 182,
    latencyMs: 220,
    pricePerMinUsd: 0,
    cat: { conversational: 94, news: 82, narration: 88, hard: 78 },
    trend: 0,
  },
];

const RANK_THRESHOLD = 250;

/** Build a per-category fingerprint from a raw system's category map. */
function categoryScores(raw: RawSystem): CategoryScore[] {
  // Scale per-category vote counts to sum near the system's total.
  const per = Math.round(raw.voteCount / CATEGORIES.length);
  return CATEGORIES.map((c) => ({
    category: c.key,
    humanness: raw.cat[c.key],
    voteCount: per,
  }));
}

/**
 * Illustrative leaderboard. `lang` is accepted for parity with the real data
 * layer; the demo returns the same English board for every language.
 */
export function demoLeaderboard(_lang: string): LeaderboardRow[] {
  // Derive a self-consistent Elo score from each system's humanness so the CI
  // bars and the humanness column tell the same story.
  const withScores = RAW.map((raw) => {
    // humanness = 200 * P(preferred over human); invert to a win prob, then to Elo.
    const p = raw.isHuman ? 0.5 : Math.min(0.5, raw.humanness / 200);
    const btScore = raw.isHuman
      ? HUMAN_SCORE
      : HUMAN_SCORE - 400 * Math.log10((1 - p) / Math.max(p, 1e-6));
    return { raw, btScore, winRateVsHuman: p };
  });

  // Rank only the AI contestants (the human is the reference, not ranked) and
  // only when they clear the vote threshold.
  const contestants = withScores
    .filter((s) => !s.raw.isHuman)
    .sort((a, b) => b.btScore - a.btScore);
  const rankBySystem = new Map<string, number | null>();
  let nextRank = 0;
  for (const s of contestants) {
    if (s.raw.voteCount >= RANK_THRESHOLD) {
      nextRank += 1;
      rankBySystem.set(s.raw.systemId, nextRank);
    } else {
      rankBySystem.set(s.raw.systemId, null);
    }
  }

  return withScores
    .sort((a, b) => b.btScore - a.btScore)
    .map(({ raw, btScore, winRateVsHuman }) => ({
      systemId: raw.systemId,
      vendor: raw.vendor,
      modelName: raw.modelName,
      voiceLabel: raw.voiceLabel,
      isHuman: raw.isHuman ?? false,
      isOpenSource: raw.isOpenSource ?? false,
      btScore,
      btLo: btScore - raw.ci,
      btHi: btScore + raw.ci,
      rank: raw.isHuman ? null : (rankBySystem.get(raw.systemId) ?? null),
      voteCount: raw.voteCount,
      isProvisional: !raw.isHuman && raw.voteCount < RANK_THRESHOLD,
      humanness: raw.isHuman ? 100 : raw.humanness,
      winRateVsHuman,
      latencyMs: raw.latencyMs,
      pricePerMinUsd: raw.pricePerMinUsd,
      categories: categoryScores(raw),
      trend: raw.trend,
      // Detectability varies ±9 from humanness so it tells its own story (a
      // voice can win yet still be quick to "tell"); judge-time grows with
      // how human a voice is (people deliberate longer over convincing ones).
      detectability: raw.isHuman
        ? 100
        : Math.round(
            Math.max(42, Math.min(99, raw.humanness + (hashStr(raw.systemId) - 0.5) * 18)),
          ),
      judgeSec: Number((1.6 + (raw.humanness / 100) * 6).toFixed(1)),
    }));
}

/** Headline arena stats for the landing "living arena" counters. */
export function demoStats(): ArenaStats {
  const rows = RAW.filter((r) => !r.isHuman);
  const totalVotes = 142_857;
  // Fool rate = the best AI's win prob vs the human, as a share.
  const topHumanness = Math.max(...rows.map((r) => r.humanness));
  const aiFoolRate = Math.min(0.5, topHumanness / 200);
  return {
    totalVotes,
    systems: rows.length,
    languages: 16,
    aiFoolRate,
    votesLast24h: 3_219,
  };
}

/* ------------------------------------------------------------------ */
/* Voting — blind A/B pairs, sometimes "spot the human"                */
/* ------------------------------------------------------------------ */

/** Prompts that match the locally generated clips in public/demo/. */
const PROMPTS: { text: string; category: PromptCategory }[] = [
  {
    text: "The early morning train glided quietly through the misty valley.",
    category: "narration",
  },
  {
    text: "Could you please confirm your appointment for next Tuesday at three?",
    category: "conversational",
  },
  {
    text: "Honestly, I didn't expect the show to be that good — but it really was.",
    category: "conversational",
  },
];

type DemoVoice = "Samantha" | "Daniel";

/**
 * The pool of identities a blind clip can be revealed as. `human` is the
 * "spot the human" payoff. (In demo, audio is always one of the two local
 * macOS voices — the identities are illustrative, as the banner notes.)
 */
const POOL: Record<string, RevealSide> = {
  human: {
    systemId: "human-ref",
    vendor: "Human",
    modelName: "reference recording",
    isHuman: true,
  },
  elevenlabs: { systemId: "elevenlabs-v3", vendor: "ElevenLabs", modelName: "Eleven v3" },
  openai: { systemId: "openai-4o-tts", vendor: "OpenAI", modelName: "gpt-4o-tts" },
  cartesia: { systemId: "cartesia-sonic3", vendor: "Cartesia", modelName: "Sonic-3" },
  hume: { systemId: "hume-octave2", vendor: "Hume", modelName: "Octave 2" },
  kokoro: { systemId: "kokoro-82m", vendor: "Kokoro", modelName: "Kokoro 82M" },
};

const AI_KEYS = ["elevenlabs", "openai", "cartesia", "hume", "kokoro"] as const;

function clip(idx: number, voice: DemoVoice): string {
  return `/demo/p${idx}_${voice}.mp3`;
}

/**
 * A blind demo pair. The pairId encodes everything the reveal needs so the
 * vote route stays stateless: `demo:<idx>:<aKey>:<bKey>`.
 *
 * ~25% of pairs include the human reference (the "spot the human" hook).
 */
export function demoPair(lang: string): PairResponse {
  const idx = Math.floor(Math.random() * PROMPTS.length);
  const includeHuman = Math.random() < 0.25;

  let aKey: string;
  let bKey: string;
  if (includeHuman) {
    aKey = "human";
    bKey = AI_KEYS[(Math.random() * AI_KEYS.length) | 0];
  } else {
    const i = (Math.random() * AI_KEYS.length) | 0;
    let j = (Math.random() * AI_KEYS.length) | 0;
    while (j === i) j = (Math.random() * AI_KEYS.length) | 0;
    aKey = AI_KEYS[i];
    bKey = AI_KEYS[j];
  }

  // Map the two sides onto the two local voices we actually have audio for.
  return {
    pairId: `demo:${idx}:${aKey}:${bKey}`,
    promptText: PROMPTS[idx].text,
    language: lang,
    isGold: false,
    category: PROMPTS[idx].category,
    a: { sampleId: `demo-a-${idx}`, audioUrl: clip(idx, "Samantha") },
    b: { sampleId: `demo-b-${idx}`, audioUrl: clip(idx, "Daniel") },
  };
}

/** Tiny stable hash so crowd numbers are consistent for a given pairId. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295; // 0..1
}

/**
 * Decode a demo pairId back into the A/B identities for the post-vote reveal,
 * plus illustrative crowd stats keyed deterministically off the pairId.
 */
export function demoReveal(pairId: string, picked?: Verdict): VoteResult["reveal"] {
  const parts = pairId.split(":");
  const aKey = parts[2] ?? "elevenlabs";
  const bKey = parts[3] ?? "openai";
  const a = POOL[aKey] ?? POOL.elevenlabs;
  const b = POOL[bKey] ?? POOL.openai;

  const seed = hashStr(pairId);
  const votes = 600 + Math.floor(seed * 2400);
  const agreePct = 0.55 + seed * 0.35;
  const hasHuman = !!a.isHuman || !!b.isHuman;
  // Share who preferred the human side — sometimes the AI wins (the fool moment).
  const humanPreferredPct = hasHuman ? 0.42 + seed * 0.22 : undefined;

  return {
    a,
    b,
    picked,
    crowd: {
      votes,
      agreePct,
      humanPreferredPct,
    },
  };
}
