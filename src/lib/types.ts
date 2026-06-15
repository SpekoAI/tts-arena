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

/** Convenience lookup of a `Lang` by its code. */
export function getLang(code: string): Lang | undefined {
  return LANGUAGES.find((l) => l.code === code);
}

/**
 * A blind pair served to the voter. Vendor/model identities are intentionally
 * absent — they are only revealed in {@link VoteResult} after a vote lands.
 */
export interface PairResponse {
  pairId: string;
  promptText: string;
  language: string;
  isGold: boolean;
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

/** Server response to a vote — reveals the blind A/B identities. */
export interface VoteResult {
  ok: true;
  reveal: {
    a: { vendor: string; modelName: string };
    b: { vendor: string; modelName: string };
  };
}

/** One row of a per-language Bradley-Terry leaderboard. */
export interface LeaderboardRow {
  systemId: string;
  vendor: string;
  modelName: string;
  voiceLabel: string | null;
  btScore: number;
  btLo: number;
  btHi: number;
  rank: number | null;
  voteCount: number;
  /** True when the system has too few votes to be trusted (< 250). */
  isProvisional: boolean;
}
