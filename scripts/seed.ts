/**
 * scripts/seed.ts — populate the TTS Arena from a prompts JSON + audio dir.
 *
 * Run with Bun:
 *   bun run scripts/seed.ts \
 *     --prompts content/prompts.example.json \
 *     --audio   ./audio \
 *     [--dry-run]
 *
 * Requires (real run): DATABASE_URL and GCS_PUBLIC_BASE_URL in the env.
 *   GCS_PUBLIC_BASE_URL=https://storage.googleapis.com/tts-arena-public
 *
 * What it does, idempotently (safe to re-run):
 *   1. Upserts `systems`        from the JSON `systems` array.
 *   2. Inserts  `prompts`       (unique on language+text).
 *   3. Inserts  `samples`       (one per system x prompt within a language),
 *                               with a public GCS audioUrl.
 *   4. Generates `pairs`        — every CROSS-system pairing of samples that
 *                               share a prompt, stored canonically as
 *                               sampleAId < sampleBId, never same-system.
 *   5. Inserts  `goldPairs`     for prompts flagged isGold (when both sides
 *                               exist), recording an expected verdict.
 *
 * The pair-generation logic (step 4) is REAL and correct. The audio wiring
 * (step 3) is the part you adapt to your storage layout — see the TODOs.
 *
 * --------------------------------------------------------------------------
 * INPUT FORMAT: see content/prompts.example.json. Shape:
 *   {
 *     "audioNaming": { "ext": "mp3", "template": "{language}/{systemId}/{promptKey}.{ext}" },
 *     "systems":  [{ id, vendor, modelName, modelVersion, voiceLabel?, isOpenSource?, homepageUrl?, supportedLangs? }],
 *     "prompts":  [{ language, text, category?, key?, isGold? }]
 *   }
 * --------------------------------------------------------------------------
 */

import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import {
  goldPairs,
  pairs,
  prompts as promptsTable,
  samples as samplesTable,
  systems as systemsTable,
} from "../src/lib/db/schema";

/* ------------------------------------------------------------------ */
/* Input shapes                                                       */
/* ------------------------------------------------------------------ */

type Category = "general" | "conversational" | "news" | "narration" | "hard";
type Verdict = "a" | "b" | "tie";

interface SystemInput {
  id: string;
  vendor: string;
  modelName: string;
  modelVersion: string;
  voiceLabel?: string | null;
  isOpenSource?: boolean;
  homepageUrl?: string | null;
  supportedLangs?: string[];
}

interface PromptInput {
  language: string;
  text: string;
  category?: Category;
  /** Stable key used to resolve the audio object path; falls back to a slug. */
  key?: string;
  isGold?: boolean;
}

interface SeedInput {
  audioNaming?: { ext?: string; template?: string };
  systems: SystemInput[];
  prompts: PromptInput[];
}

/* ------------------------------------------------------------------ */
/* CLI args                                                           */
/* ------------------------------------------------------------------ */

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const PROMPTS_PATH = String(args.prompts ?? "content/prompts.example.json");
const AUDIO_DIR = args.audio ? String(args.audio) : undefined;
const DRY_RUN = Boolean(args["dry-run"]);

const GCS_BASE = (process.env.GCS_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function promptKey(p: PromptInput): string {
  return p.key ?? slug(p.text);
}

/**
 * Resolve a sample's public audio URL from the (systemId, prompt) pair.
 *
 * TODO(audio): adapt this to your real GCS object layout. The default uses the
 * `audioNaming.template` from the JSON (placeholders {language} {systemId}
 * {promptKey} {ext}) joined onto GCS_PUBLIC_BASE_URL. If you upload with a
 * different scheme (e.g. a content hash), change this single function — it is
 * the only place URL construction lives.
 */
function buildAudioUrl(
  system: SystemInput,
  prompt: PromptInput,
  naming: SeedInput["audioNaming"],
): string {
  const ext = naming?.ext ?? "mp3";
  const template = naming?.template ?? "{language}/{systemId}/{promptKey}.{ext}";
  const objectPath = template
    .replaceAll("{language}", prompt.language)
    .replaceAll("{systemId}", system.id)
    .replaceAll("{promptKey}", promptKey(prompt))
    .replaceAll("{ext}", ext);
  return `${GCS_BASE}/${objectPath}`;
}

/**
 * Optionally verify a local audio file exists before inserting its sample.
 * TODO(audio): if you keep local copies in --audio, this guards against
 * inserting samples whose audio you never uploaded. With no --audio dir, all
 * (system, prompt) combinations are assumed renderable for languages the
 * system supports.
 */
async function audioExistsLocally(
  system: SystemInput,
  prompt: PromptInput,
  naming: SeedInput["audioNaming"],
): Promise<boolean> {
  if (!AUDIO_DIR) return true;
  const ext = naming?.ext ?? "mp3";
  const template = naming?.template ?? "{language}/{systemId}/{promptKey}.{ext}";
  const rel = template
    .replaceAll("{language}", prompt.language)
    .replaceAll("{systemId}", system.id)
    .replaceAll("{promptKey}", promptKey(prompt))
    .replaceAll("{ext}", ext);
  try {
    await stat(resolve(AUDIO_DIR, rel));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Pair generation — the REAL, correct logic                          */
/* ------------------------------------------------------------------ */

interface SampleRef {
  sampleId: number;
  systemId: string;
}

/**
 * Given the samples that exist for ONE prompt (one per system at most),
 * produce every unordered CROSS-system pairing, canonicalized so that the
 * lower sample id is always side A (matching the pairs_sample_order_check
 * CHECK constraint sampleAId < sampleBId) and never pairing a system with
 * itself.
 *
 * For n samples this yields n*(n-1)/2 pairs.
 */
export function generatePairsForPrompt(
  refs: SampleRef[],
): Array<{ sampleAId: number; sampleBId: number }> {
  const out: Array<{ sampleAId: number; sampleBId: number }> = [];
  for (let i = 0; i < refs.length; i++) {
    for (let j = i + 1; j < refs.length; j++) {
      const x = refs[i];
      const y = refs[j];
      // Cross-system only — skip any same-system pairing defensively (a prompt
      // should have at most one sample per system, but guard anyway).
      if (x.systemId === y.systemId) continue;
      // Canonicalize: smaller id is A.
      const [a, b] =
        x.sampleId < y.sampleId
          ? [x.sampleId, y.sampleId]
          : [y.sampleId, x.sampleId];
      out.push({ sampleAId: a, sampleBId: b });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  const raw = await readFile(resolve(PROMPTS_PATH), "utf8");
  const input = JSON.parse(raw) as SeedInput;

  if (!Array.isArray(input.systems) || input.systems.length === 0) {
    throw new Error(`${PROMPTS_PATH}: "systems" array is required and non-empty`);
  }
  if (!Array.isArray(input.prompts) || input.prompts.length === 0) {
    throw new Error(`${PROMPTS_PATH}: "prompts" array is required and non-empty`);
  }
  if (!DRY_RUN && !GCS_BASE) {
    throw new Error(
      "GCS_PUBLIC_BASE_URL is not set — required to build public sample URLs (or pass --dry-run).",
    );
  }

  const naming = input.audioNaming;
  const systemById = new Map(input.systems.map((s) => [s.id, s]));

  const stats = {
    systems: 0,
    prompts: 0,
    samples: 0,
    pairs: 0,
    goldPairs: 0,
    skippedNoAudio: 0,
  };

  /* ---- 1. systems (upsert) ------------------------------------------- */
  for (const s of input.systems) {
    stats.systems++;
    if (DRY_RUN) continue;
    await db
      .insert(systemsTable)
      .values({
        id: s.id,
        vendor: s.vendor,
        modelName: s.modelName,
        modelVersion: s.modelVersion,
        voiceLabel: s.voiceLabel ?? null,
        isOpenSource: s.isOpenSource ?? false,
        homepageUrl: s.homepageUrl ?? null,
        supportedLangs: s.supportedLangs ?? [],
      })
      .onConflictDoUpdate({
        target: systemsTable.id,
        set: {
          vendor: s.vendor,
          modelName: s.modelName,
          modelVersion: s.modelVersion,
          voiceLabel: s.voiceLabel ?? null,
          isOpenSource: s.isOpenSource ?? false,
          homepageUrl: s.homepageUrl ?? null,
          supportedLangs: s.supportedLangs ?? [],
        },
      });
  }

  /* ---- 2 + 3. prompts and samples ------------------------------------ */
  // For each prompt we collect the samples that got created so we can pair them.
  // Keyed by promptId -> { language, isGold, refs: SampleRef[] }.
  const perPrompt = new Map<
    number,
    { language: string; isGold: boolean; refs: SampleRef[] }
  >();

  for (const p of input.prompts) {
    stats.prompts++;
    const category: Category = p.category ?? "general";
    const isGold = p.isGold ?? false;

    if (DRY_RUN) {
      // Simulate sample ids for dry-run pairing preview.
      const eligible = input.systems.filter((s) =>
        (s.supportedLangs ?? []).length === 0
          ? true
          : (s.supportedLangs ?? []).includes(p.language),
      );
      const refs: SampleRef[] = eligible.map((s, idx) => ({
        sampleId: idx + 1,
        systemId: s.id,
      }));
      stats.samples += refs.length;
      stats.pairs += generatePairsForPrompt(refs).length;
      continue;
    }

    // Insert the prompt (unique on language+text). Re-fetch the id afterward so
    // re-runs reuse the existing row.
    await db
      .insert(promptsTable)
      .values({
        language: p.language,
        text: p.text,
        category,
        isGold,
        isActive: true,
      })
      .onConflictDoNothing({
        target: [promptsTable.language, promptsTable.text],
      });

    const [promptRow] = await db
      .select({ id: promptsTable.id })
      .from(promptsTable)
      .where(
        and(
          eq(promptsTable.language, p.language),
          eq(promptsTable.text, p.text),
        ),
      )
      .limit(1);
    if (!promptRow) throw new Error(`prompt not found after insert: ${p.text}`);
    const promptId = promptRow.id;

    const refs: SampleRef[] = [];

    // One sample per system that supports this language (empty supportedLangs
    // means "all languages").
    for (const s of input.systems) {
      const supports =
        (s.supportedLangs ?? []).length === 0 ||
        (s.supportedLangs ?? []).includes(p.language);
      if (!supports) continue;

      if (!(await audioExistsLocally(s, p, naming))) {
        stats.skippedNoAudio++;
        continue;
      }

      const audioUrl = buildAudioUrl(s, p, naming);

      // TODO(audio): durationMs / lufs are nullable here. Populate them from
      // your render pipeline (loudness-normalize to a target LUFS before
      // upload, then stamp the measured value) for fairer A/B comparison.
      await db
        .insert(samplesTable)
        .values({
          systemId: s.id,
          promptId,
          language: p.language,
          audioUrl,
          durationMs: null,
          lufs: null,
        })
        .onConflictDoNothing({
          target: [samplesTable.systemId, samplesTable.promptId],
        });

      const [sampleRow] = await db
        .select({ id: samplesTable.id })
        .from(samplesTable)
        .where(
          and(
            eq(samplesTable.systemId, s.id),
            eq(samplesTable.promptId, promptId),
          ),
        )
        .limit(1);
      if (!sampleRow) continue;
      refs.push({ sampleId: sampleRow.id, systemId: s.id });
      stats.samples++;
    }

    perPrompt.set(promptId, { language: p.language, isGold, refs });
  }

  if (DRY_RUN) {
    console.log("[dry-run] would seed:", stats);
    console.log("[dry-run] no database writes performed.");
    return;
  }

  /* ---- 4. pairs (cross-system, canonical, idempotent) ---------------- */
  for (const [promptId, info] of perPrompt) {
    const generated = generatePairsForPrompt(info.refs);
    for (const g of generated) {
      await db
        .insert(pairs)
        .values({
          language: info.language,
          promptId,
          sampleAId: g.sampleAId,
          sampleBId: g.sampleBId,
        })
        .onConflictDoNothing({
          target: [pairs.promptId, pairs.sampleAId, pairs.sampleBId],
        });
      stats.pairs++;
    }
  }

  /* ---- 5. gold pairs -------------------------------------------------- */
  // For prompts flagged isGold, mark their generated pairs as attention checks.
  // TODO(gold): a meaningful gold pair needs a KNOWN better side (e.g. a clean
  // reference recording vs. a deliberately-degraded clip). Here we record an
  // expected verdict of 'a' as a placeholder; set this from your own ground
  // truth before relying on goldCorrect for rater quality scoring.
  for (const [promptId, info] of perPrompt) {
    if (!info.isGold) continue;
    const goldRows = await db
      .select({ id: pairs.id })
      .from(pairs)
      .where(eq(pairs.promptId, promptId));
    for (const row of goldRows) {
      const expected: Verdict = "a"; // TODO(gold): replace with real ground truth.
      await db
        .insert(goldPairs)
        .values({ pairId: row.id, expected, injectRate: 0.05 })
        .onConflictDoNothing({ target: goldPairs.pairId });
      stats.goldPairs++;
    }
  }

  console.log("Seed complete:", stats);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
