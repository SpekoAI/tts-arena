/**
 * Drizzle schema for the TTS Arena.
 *
 * The competitor unit is a "system" (provider + model + optional voice).
 * Anonymous voters cast blind A/B votes on language-scoped pairs; a
 * pure-TypeScript Bradley-Terry job aggregates votes into per-language
 * `rankings`.
 */

import {
  bigint,
  bigserial,
  boolean,
  char,
  check,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ------------------------------------------------------------------ */
/* Enums                                                              */
/* ------------------------------------------------------------------ */

export const voteVerdict = pgEnum("vote_verdict", ["a", "b", "tie"]);
export const systemStatus = pgEnum("system_status", [
  "pending",
  "approved",
  "deprecated",
]);
export const promptCategory = pgEnum("prompt_category", [
  "general",
  "conversational",
  "news",
  "narration",
  "hard",
]);

/* ------------------------------------------------------------------ */
/* Custom types                                                       */
/* ------------------------------------------------------------------ */

/** Postgres `bytea`, surfaced to Drizzle as a Node Buffer. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/* ------------------------------------------------------------------ */
/* systems — a competitor (vendor + model + optional voice)           */
/* ------------------------------------------------------------------ */

export const systems = pgTable("systems", {
  id: text("id").primaryKey(),
  vendor: text("vendor").notNull(),
  modelName: text("model_name").notNull(),
  modelVersion: text("model_version").notNull(),
  voiceLabel: text("voice_label"),
  isOpenSource: boolean("is_open_source").notNull().default(false),
  homepageUrl: text("homepage_url"),
  supportedLangs: text("supported_langs")
    .array()
    .notNull()
    .default(sql`'{}'`),
  status: systemStatus("status").notNull().default("approved"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------------------------------------------------ */
/* prompts — the text read aloud, scoped per language                 */
/* ------------------------------------------------------------------ */

export const prompts = pgTable(
  "prompts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    language: text("language").notNull(),
    text: text("text").notNull(),
    category: promptCategory("category").notNull().default("general"),
    isGold: boolean("is_gold").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => ({
    uqLangText: unique("prompts_language_text_unique").on(t.language, t.text),
  }),
);

/* ------------------------------------------------------------------ */
/* samples — one rendered audio file (system × prompt)                */
/* ------------------------------------------------------------------ */

export const samples = pgTable(
  "samples",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    systemId: text("system_id")
      .notNull()
      .references(() => systems.id),
    promptId: bigint("prompt_id", { mode: "number" })
      .notNull()
      .references(() => prompts.id),
    language: text("language").notNull(),
    /** Public GCS URL — no signing. */
    audioUrl: text("audio_url").notNull(),
    durationMs: integer("duration_ms"),
    lufs: real("lufs"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uqSystemPrompt: unique("samples_system_prompt_unique").on(
      t.systemId,
      t.promptId,
    ),
  }),
);

/* ------------------------------------------------------------------ */
/* pairs — a blind A/B served to voters (sampleA < sampleB)           */
/* ------------------------------------------------------------------ */

export const pairs = pgTable(
  "pairs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    language: text("language").notNull(),
    promptId: bigint("prompt_id", { mode: "number" })
      .notNull()
      .references(() => prompts.id),
    sampleAId: bigint("sample_a_id", { mode: "number" })
      .notNull()
      .references(() => samples.id),
    sampleBId: bigint("sample_b_id", { mode: "number" })
      .notNull()
      .references(() => samples.id),
    servedCount: integer("served_count").notNull().default(0),
    lastServedAt: timestamp("last_served_at", { withTimezone: true }),
  },
  (t) => ({
    // Canonical ordering keeps each unordered pair stored once. NOTE: pair
    // generation must also ensure sampleA and sampleB belong to DIFFERENT
    // systems (not enforceable as a column-only CHECK).
    ckOrder: check("pairs_sample_order_check", sql`${t.sampleAId} < ${t.sampleBId}`),
    uqPair: unique("pairs_prompt_samples_unique").on(
      t.promptId,
      t.sampleAId,
      t.sampleBId,
    ),
    ixLangServed: index("pairs_language_served_idx").on(
      t.language,
      t.servedCount,
    ),
  }),
);

/* ------------------------------------------------------------------ */
/* goldPairs — attention-check pairs with a known expected verdict    */
/* ------------------------------------------------------------------ */

export const goldPairs = pgTable("gold_pairs", {
  pairId: bigint("pair_id", { mode: "number" })
    .primaryKey()
    .references(() => pairs.id),
  expected: voteVerdict("expected").notNull(),
  injectRate: real("inject_rate").notNull().default(0.05),
});

/* ------------------------------------------------------------------ */
/* votes — one anonymous blind vote                                   */
/* ------------------------------------------------------------------ */

export const votes = pgTable(
  "votes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** Anonymous cookie UUID — no account, no PII. */
    anonId: text("anon_id").notNull(),
    pairId: bigint("pair_id", { mode: "number" })
      .notNull()
      .references(() => pairs.id),
    /** The pair's language — drives which BT leaderboard this counts toward. */
    language: text("language").notNull(),
    /** The voter's declared (cookie) language, for native-only filtering. */
    declaredLang: text("declared_lang"),
    verdict: voteVerdict("verdict").notNull(),
    rtMs: integer("rt_ms"),
    playedAMs: integer("played_a_ms").notNull().default(0),
    playedBMs: integer("played_b_ms").notNull().default(0),
    /** Position-bias covariate: was sample A shown on the left? */
    leftWasA: boolean("left_was_a").notNull(),
    /** Order covariate: which clip was played first. */
    playedFirst: char("played_first", { length: 1 }),
    /** Hashed x-forwarded-for — never the raw IP. */
    ipHash: bytea("ip_hash"),
    turnstileOk: boolean("turnstile_ok").notNull().default(false),
    isGoldAttempt: boolean("is_gold_attempt").notNull().default(false),
    goldCorrect: boolean("gold_correct"),
    /** False for gold attempts and any vote excluded from ranking. */
    countsForRank: boolean("counts_for_rank").notNull().default(true),
    voteWeight: real("vote_weight").notNull().default(1.0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    ixLangCounts: index("votes_language_counts_idx").on(
      t.language,
      t.countsForRank,
    ),
    ixAnonCreated: index("votes_anon_created_idx").on(t.anonId, t.createdAt),
  }),
);

/* ------------------------------------------------------------------ */
/* rankings — per-language Bradley-Terry snapshot per system          */
/* ------------------------------------------------------------------ */

export const rankings = pgTable(
  "rankings",
  {
    systemId: text("system_id")
      .notNull()
      .references(() => systems.id),
    language: text("language").notNull(),
    btScore: real("bt_score").notNull(),
    btLo: real("bt_lo").notNull(),
    btHi: real("bt_hi").notNull(),
    rank: integer("rank"),
    voteCount: integer("vote_count").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({
      name: "rankings_system_lang_computed_pk",
      columns: [t.systemId, t.language, t.computedAt],
    }),
    ixLangComputed: index("rankings_language_computed_idx").on(
      t.language,
      t.computedAt,
    ),
  }),
);

/* ------------------------------------------------------------------ */
/* Inferred row types                                                 */
/* ------------------------------------------------------------------ */

export type System = typeof systems.$inferSelect;
export type NewSystem = typeof systems.$inferInsert;
export type Prompt = typeof prompts.$inferSelect;
export type NewPrompt = typeof prompts.$inferInsert;
export type Sample = typeof samples.$inferSelect;
export type NewSample = typeof samples.$inferInsert;
export type Pair = typeof pairs.$inferSelect;
export type NewPair = typeof pairs.$inferInsert;
export type GoldPair = typeof goldPairs.$inferSelect;
export type NewGoldPair = typeof goldPairs.$inferInsert;
export type Vote = typeof votes.$inferSelect;
export type NewVote = typeof votes.$inferInsert;
export type Ranking = typeof rankings.$inferSelect;
export type NewRanking = typeof rankings.$inferInsert;
