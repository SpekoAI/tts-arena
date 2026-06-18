/**
 * Synthesize real comparison clips via the Speko API.
 *
 *   SPEKO_API_KEY=...  bun run scripts/synth-samples.ts
 *
 * For each configured TTS provider, picks a voice and renders every prompt,
 * saving the audio under public/samples/<systemId>/<promptKey>.<ext> and
 * writing content/samples.json (the manifest the arena reads). With that file
 * present, the arena serves REAL blind pairs — two different models speaking
 * the same line — instead of the demo clips.
 *
 * Handles both mp3 (ElevenLabs etc.) and raw PCM (Cartesia) — PCM is wrapped
 * into a WAV so browsers can play it.
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  listTtsProviders,
  listVoices,
  synthesize,
  spekoConfigured,
} from "../src/lib/speko";

const MAX_PROMPTS = 3; // keep the first run quick + cheap; bump later

type Prompt = { key: string; text: string; category?: string };

function pcmToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const channels = 1;
  const bits = 16;
  const blockAlign = (channels * bits) / 8;
  const byteRate = sampleRate * blockAlign;
  const buf = new ArrayBuffer(44 + pcm.byteLength);
  const dv = new DataView(buf);
  let o = 0;
  const str = (s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o++, s.charCodeAt(i));
  };
  str("RIFF");
  dv.setUint32(o, 36 + pcm.byteLength, true);
  o += 4;
  str("WAVE");
  str("fmt ");
  dv.setUint32(o, 16, true);
  o += 4;
  dv.setUint16(o, 1, true);
  o += 2;
  dv.setUint16(o, channels, true);
  o += 2;
  dv.setUint32(o, sampleRate, true);
  o += 4;
  dv.setUint32(o, byteRate, true);
  o += 4;
  dv.setUint16(o, blockAlign, true);
  o += 2;
  dv.setUint16(o, bits, true);
  o += 2;
  str("data");
  dv.setUint32(o, pcm.byteLength, true);
  o += 4;
  new Uint8Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}

function formatFor(contentType: string): { ext: string; pcmRate: number | null } {
  const ct = contentType.toLowerCase();
  if (ct.includes("mpeg") || ct.includes("mp3")) return { ext: "mp3", pcmRate: null };
  if (ct.includes("wav")) return { ext: "wav", pcmRate: null };
  if (ct.includes("ogg")) return { ext: "ogg", pcmRate: null };
  if (ct.includes("pcm")) {
    const m = ct.match(/rate=(\d+)/);
    return { ext: "wav", pcmRate: m ? parseInt(m[1], 10) : 24000 };
  }
  return { ext: "bin", pcmRate: null };
}

async function loadPrompts(): Promise<Prompt[]> {
  try {
    const raw = await readFile("content/prompts.example.json", "utf8");
    const json = JSON.parse(raw) as {
      prompts?: { language: string; key?: string; text: string; category?: string; isGold?: boolean }[];
    };
    return (json.prompts ?? [])
      .filter((p) => p.language === "en" && !p.isGold)
      .slice(0, MAX_PROMPTS)
      .map((p, i) => ({ key: p.key ?? `en-${i}`, text: p.text, category: p.category }));
  } catch {
    return [
      { key: "en-1", text: "The early morning train glided quietly through the misty valley.", category: "narration" },
      { key: "en-2", text: "Could you please confirm your appointment for next Tuesday at three?", category: "conversational" },
      { key: "en-3", text: "Officials confirmed the bridge will reopen to traffic next month.", category: "news" },
    ];
  }
}

async function main() {
  if (!spekoConfigured()) {
    console.error("✗ SPEKO_API_KEY not set. Add it to tts-arena/.env.local and re-run.");
    process.exit(1);
  }

  const prompts = await loadPrompts();
  console.log(`→ ${prompts.length} prompts`);
  const providers = await listTtsProviders();
  console.log(`→ ${providers.length} TTS providers`);

  const systems: { systemId: string; vendor: string; model: string; voice: string }[] = [];
  const samples: { systemId: string; promptKey: string; url: string }[] = [];

  const short = (s: string) => (s.length > 130 ? s.slice(0, 130) + "…" : s);

  for (const p of providers) {
    // The voice's `vendor` is the canonical routing key for allowedProviders.
    let voice = "";
    let routingKey = p.key.replace(/-tts$/, "");
    try {
      const vs = await listVoices(p.key);
      if (vs[0]) {
        voice = vs[0].id;
        routingKey = vs[0].vendor || routingKey;
      }
    } catch {
      /* no static voice list (e.g. ElevenLabs is account-scoped) — use default */
    }
    const systemId = p.key;
    const dir = path.join("public", "samples", systemId);
    await mkdir(dir, { recursive: true });

    let ok = 0;
    let resolvedModel = p.models?.[0]?.id ?? "";
    for (const prompt of prompts) {
      try {
        const res = await synthesize(prompt.text, {
          language: "en",
          providers: [routingKey],
          ...(voice ? { voice } : {}),
        });
        if (res.model && res.model !== "unknown") resolvedModel = res.model;
        const { ext, pcmRate } = formatFor(res.contentType);
        const bytes = pcmRate ? pcmToWav(res.bytes, pcmRate) : res.bytes;
        const file = `${prompt.key}.${ext}`;
        await writeFile(path.join(dir, file), bytes);
        samples.push({ systemId, promptKey: prompt.key, url: `/samples/${systemId}/${file}` });
        ok++;
      } catch (e) {
        console.warn(`  ! ${p.key} / ${prompt.key}: ${short((e as Error).message)}`);
      }
    }
    if (ok > 0) {
      systems.push({ systemId, vendor: p.name, model: resolvedModel, voice });
      console.log(`  ✓ ${p.name} — ${ok}/${prompts.length} clips (${resolvedModel})`);
    }
  }

  await mkdir("content", { recursive: true });
  await writeFile(
    "content/samples.json",
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        prompts: prompts.map((p) => ({ key: p.key, text: p.text, category: p.category })),
        systems,
        samples,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  console.log(`\n✓ Wrote content/samples.json — ${systems.length} systems, ${samples.length} clips`);
  console.log("  Restart the dev server; the arena will now serve real pairs.");
}

main().catch((e) => {
  console.error("✗ synth-samples failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
