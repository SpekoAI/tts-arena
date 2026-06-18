/**
 * Shared contract types for the TTS Arena.
 *
 * These types are the wire contract between the API routes, the client
 * components, and the ranking layer. Keep them framework-agnostic and free of
 * server-only imports so both server and client code can import from here.
 */

export type Verdict = "a" | "b" | "tie";

export interface Lang {
  /** BCP-47 primary subtag, lowercase (e.g. "en", "zh"). */
  code: string;
  /** English display name. */
  englishName: string;
  /** Endonym — the language's name in its own script. */
  nativeName: string;
  /** Emoji flag used in the picker. */
  flag: string;
  /** Right-to-left script (Arabic, Hebrew, …). */
  rtl?: boolean;
}

/**
 * Starter set of arena languages. `nativeName` is the endonym in its own
 * script; `flag` is a reasonable regional flag. Right-to-left scripts carry
 * `rtl: true` so the UI can mirror layout/text direction.
 *
 * English is intentionally first: the arena is English-first by default, and
 * the rest of the set is here for the multilingual infrastructure that already
 * exists in the schema and ranking pipeline.
 */
export const LANGUAGES: Lang[] = [
  { code: "en", englishName: "English", nativeName: "English", flag: "🇬🇧" },
  { code: "es", englishName: "Spanish", nativeName: "Español", flag: "🇪🇸" },
  { code: "de", englishName: "German", nativeName: "Deutsch", flag: "🇩🇪" },
  { code: "fr", englishName: "French", nativeName: "Français", flag: "🇫🇷" },
  { code: "ar", englishName: "Arabic", nativeName: "العربية", flag: "🇸🇦", rtl: true },
  { code: "hi", englishName: "Hindi", nativeName: "हिन्दी", flag: "🇮🇳" },
  { code: "zh", englishName: "Chinese", nativeName: "中文", flag: "🇨🇳" },
  { code: "ru", englishName: "Russian", nativeName: "Русский", flag: "🇷🇺" },
  { code: "th", englishName: "Thai", nativeName: "ไทย", flag: "🇹🇭" },
  { code: "vi", englishName: "Vietnamese", nativeName: "Tiếng Việt", flag: "🇻🇳" },
  { code: "id", englishName: "Indonesian", nativeName: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "uz", englishName: "Uzbek", nativeName: "Oʻzbekcha", flag: "🇺🇿" },
  { code: "ja", englishName: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
  { code: "ko", englishName: "Korean", nativeName: "한국어", flag: "🇰🇷" },
  { code: "pt", englishName: "Portuguese", nativeName: "Português", flag: "🇧🇷" },
  { code: "tr", englishName: "Turkish", nativeName: "Türkçe", flag: "🇹🇷" },
];

/** The arena's default language. English-first by product decision. */
export const DEFAULT_LANG = "en";

/** Convenience lookup of a `Lang` by its code. */
export function getLang(code: string): Lang | undefined {
  return LANGUAGES.find((l) => l.code === code);
}

/* ------------------------------------------------------------------ */
/* Prompt categories — the "skill" axes a voice is judged on           */
/* ------------------------------------------------------------------ */

export type PromptCategory =
  | "conversational"
  | "news"
  | "narration"
  | "hard";

/** Ordered category metadata for per-category leaderboards + radar charts. */
export const CATEGORIES: {
  key: PromptCategory;
  label: string;
  /** One-line description of what this category stresses. */
  blurb: string;
}[] = [
  {
    key: "conversational",
    label: "Conversational",
    blurb: "Casual speech, fillers, natural rhythm — the voice-agent use case.",
  },
  {
    key: "news",
    label: "News",
    blurb: "Clear, authoritative read of formal copy.",
  },
  {
    key: "narration",
    label: "Narration",
    blurb: "Long-form storytelling: pacing, emphasis, expressiveness.",
  },
  {
    key: "hard",
    label: "Hard text",
    blurb: "Numbers, dates, abbreviations, acronyms — where voices break.",
  },
];

/* ------------------------------------------------------------------ */
/* Humanness — preference relative to a hidden real-human reference     */
/* ------------------------------------------------------------------ */

/**
 * Probability that a voice with Bradley-Terry score `score` is preferred over
 * the human reference with score `humanScore`, under the BT/Elo model.
 */
export function winProbVsHuman(score: number, humanScore: number): number {
  return 1 / (1 + Math.pow(10, (humanScore - score) / 400));
}

/**
 * Map a "preferred-over-human" probability to a 0–100 humanness score.
 *
 * The anchor is the human itself: when a voice *ties* the human (listeners pick
 * it half the time, p = 0.5) it is statistically indistinguishable from human,
 * so humanness = 100. Below that it scales linearly to 0. Voices that beat the
 * human (p > 0.5) cap at 100 — nothing is "more than human".
 */
export function humannessFromWinProb(p: number): number {
  return Math.max(0, Math.min(100, Math.round(200 * p)));
}

/* ------------------------------------------------------------------ */
/* Wire types                                                          */
/* ------------------------------------------------------------------ */

/**
 * A blind pair served to the voter. Vendor/model identities are intentionally
 * absent — they are only revealed in {@link VoteResult} after a vote lands.
 */
export interface PairResponse {
  pairId: string;
  promptText: string;
  language: string;
  isGold: boolean;
  /** Prompt category, so the UI can badge what skill is being tested. */
  category?: PromptCategory;
  a: { sampleId: string; audioUrl: string };
  b: { sampleId: string; audioUrl: string };
}

/** Payload the client posts when casting a vote. */
export interface VoteInput {
  pairId: string;
  verdict: Verdict;
  /** Reaction time in ms from pair ready to vote submitted. */
  rtMs: number;
  /** Total ms of clip A actually played. */
  playedAMs: number;
  /** Total ms of clip B actually played. */
  playedBMs: number;
  /** Whether sample A was rendered on the left (position-bias covariate). */
  leftWasA: boolean;
  /** Which clip the voter played first (order covariate), or null if unknown. */
  playedFirst: "a" | "b" | null;
  /** Optional Cloudflare Turnstile token for bot mitigation. */
  turnstileToken?: string;
}

/** One revealed side after a vote: who made the clip, and was it the human. */
export interface RevealSide {
  systemId?: string;
  vendor: string;
  modelName: string;
  /** True when this clip was the real-human reference (the "spot the human" hook). */
  isHuman?: boolean;
}

/** Server response to a vote — reveals the blind A/B identities. */
export interface VoteResult {
  ok: true;
  reveal: {
    a: RevealSide;
    b: RevealSide;
    /** Which side the voter chose, echoed back for the reveal UI. */
    picked?: Verdict;
    /**
     * Crowd context for this pair, for the "you vs everyone" reveal moment.
     * `humanPick` is the share of voters who preferred the human side (only
     * meaningful when the pair contained the human reference).
     */
    crowd?: {
      votes: number;
      /** Share (0–1) of voters who agreed with this voter's verdict. */
      agreePct: number;
      /** Share (0–1) who picked the human, when one side was the human. */
      humanPreferredPct?: number;
    };
  };
}

/** Per-category humanness for one system — the radar "fingerprint". */
export interface CategoryScore {
  category: PromptCategory;
  /** 0–100 humanness within this category. */
  humanness: number;
  voteCount: number;
}

/** One row of a per-language leaderboard. */
export interface LeaderboardRow {
  systemId: string;
  vendor: string;
  modelName: string;
  voiceLabel: string | null;
  /** The pinned real-human reference baseline (the north star at 100). */
  isHuman?: boolean;
  isOpenSource?: boolean;
  /** Bradley-Terry point score (Elo scale, 1500 baseline). */
  btScore: number;
  btLo: number;
  btHi: number;
  rank: number | null;
  voteCount: number;
  /** True when the system has too few votes to be trusted (< 250). */
  isProvisional: boolean;
  /** 0–100 humanness vs the human reference (100 = indistinguishable). */
  humanness: number;
  /** P(this voice preferred over the human reference), 0–1. */
  winRateVsHuman: number;
  /** Median time-to-first-audio in ms, when known (buyer metric). */
  latencyMs?: number | null;
  /** USD per minute of audio, when known (buyer metric). */
  pricePerMinUsd?: number | null;
  /** Per-category humanness fingerprint. */
  categories?: CategoryScore[];
  /** Change in humanness vs the previous snapshot (signed), when known. */
  trend?: number;
  /**
   * Detectability 0–100 — how well a voice holds up under scrutiny, derived
   * from reaction time + replays + tie rate (high = listeners deliberate and
   * often can't tell; low = rejected instantly as obviously synthetic). A
   * sharper signal than win-rate: a voice can win yet still be "instantly
   * tell-able" when it loses.
   */
  detectability?: number;
  /** Median seconds a listener spends before deciding on this voice. */
  judgeSec?: number;
}

/* ------------------------------------------------------------------ */
/* Failure-mode tags — optional one-tap "why" after a vote              */
/* ------------------------------------------------------------------ */

export type FailureReason =
  | "robotic"
  | "mispronounced"
  | "pacing"
  | "emotion"
  | "glitch";

/** The optional reason chips shown after a vote, turning a preference into a
 *  per-voice weakness signal. */
export const FAILURE_REASONS: { key: FailureReason; label: string }[] = [
  { key: "robotic", label: "Robotic" },
  { key: "mispronounced", label: "Mispronounced" },
  { key: "pacing", label: "Off pacing" },
  { key: "emotion", label: "Wrong emotion" },
  { key: "glitch", label: "Glitch" },
];

/** Payload posted when a voter tags why a voice fell short. */
export interface FeedbackInput {
  pairId: string;
  /** The voice being critiqued (usually the one not chosen). */
  systemId?: string;
  reason: FailureReason;
}

/** Headline arena stats for the landing page "living arena" counters. */
export interface ArenaStats {
  totalVotes: number;
  systems: number;
  languages: number;
  /** Share (0–1) of head-to-heads vs the human where the AI was preferred. */
  aiFoolRate: number;
  /** Votes in the trailing 24h, for the "live" feel. */
  votesLast24h: number;
}
