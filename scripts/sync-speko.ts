/**
 * Pull Speko's real, account-scoped TTS catalog into the project.
 *
 *   SPEKO_API_KEY=...  bun run scripts/sync-speko.ts
 *
 * Writes content/speko-catalog.json — the real TTS providers, their models,
 * and the curated voice list. The arena uses this (when present) so the
 * leaderboard shows genuine Speko-supported voices instead of the demo set.
 * Audio synthesis (real sample clips) is the next step once this looks right.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { listTtsProviders, listVoices, spekoConfigured } from "../src/lib/speko";

async function main() {
  if (!spekoConfigured()) {
    console.error(
      "✗ SPEKO_API_KEY is not set. Add it to tts-arena/.env.local " +
        "(and optionally SPEKO_API_BASE), then re-run.",
    );
    process.exit(1);
  }

  console.log("→ Fetching TTS providers from Speko…");
  const providers = await listTtsProviders();
  console.log(`  found ${providers.length} configured TTS providers`);

  console.log("→ Fetching voice catalog…");
  let voices: Awaited<ReturnType<typeof listVoices>> = [];
  try {
    voices = await listVoices();
  } catch (e) {
    console.warn("  (voices fetch failed, continuing without)", (e as Error).message);
  }

  const catalog = {
    fetchedAt: new Date().toISOString(),
    providers: providers.map((p) => ({
      key: p.key,
      name: p.name,
      models: (p.models ?? []).map((m) => m.id),
      openSource: (p.models ?? []).some((m) => m.capabilities?.openSource),
    })),
    voices,
  };

  await mkdir("content", { recursive: true });
  await writeFile(
    "content/speko-catalog.json",
    JSON.stringify(catalog, null, 2) + "\n",
    "utf8",
  );

  console.log("\n✓ Wrote content/speko-catalog.json");
  for (const p of catalog.providers) {
    console.log(`  · ${p.name} (${p.key})${p.models.length ? ` — ${p.models.join(", ")}` : ""}`);
  }
  void 0;
  console.log(`  · ${catalog.voices.length} voices`);
}

main().catch((e) => {
  console.error("✗ sync-speko failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
