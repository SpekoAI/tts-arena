/**
 * Real-sample arena data (server-side).
 *
 * When `content/samples.json` exists (written by scripts/synth-samples.ts after
 * a Speko synthesis run), the arena serves REAL blind pairs — two different
 * models speaking the same prompt — and the reveal shows the true vendor/model.
 * Until then this is inert and the arena falls back to demo clips.
 */

import fs from "node:fs";
import path from "node:path";
import type { PairResponse, PromptCategory, Verdict, VoteResult } from "./types";

interface Manifest {
  prompts: { key: string; text: string; category?: string }[];
  systems: { systemId: string; vendor: string; model: string; voice: string }[];
  samples: { systemId: string; promptKey: string; url: string }[];
}

let cache: Manifest | null | undefined;

function load(): Manifest | null {
  if (cache !== undefined) return cache;
  try {
    const file = path.join(process.cwd(), "content", "samples.json");
    cache = JSON.parse(fs.readFileSync(file, "utf8")) as Manifest;
  } catch {
    cache = null;
  }
  return cache;
}

export function hasRealSamples(): boolean {
  const m = load();
  return !!m && m.samples.length >= 2 && m.systems.length >= 2;
}

/** A real cross-model blind pair for a randomly chosen prompt. */
export function realPair(lang: string): PairResponse {
  const m = load()!;
  const byPrompt = new Map<string, { systemId: string; url: string }[]>();
  for (const s of m.samples) {
    const arr = byPrompt.get(s.promptKey) ?? [];
    arr.push({ systemId: s.systemId, url: s.url });
    byPrompt.set(s.promptKey, arr);
  }
  const eligible = [...byPrompt.entries()].filter(([, v]) => v.length >= 2);
  const [promptKey, clips] = eligible[(Math.random() * eligible.length) | 0];

  const i = (Math.random() * clips.length) | 0;
  let j = (Math.random() * clips.length) | 0;
  while (j === i) j = (Math.random() * clips.length) | 0;
  const A = clips[i];
  const B = clips[j];

  const prompt = m.prompts.find((p) => p.key === promptKey);
  return {
    pairId: `real:${promptKey}:${A.systemId}:${B.systemId}`,
    promptText: prompt?.text ?? "",
    language: lang,
    isGold: false,
    category: prompt?.category as PromptCategory | undefined,
    a: { sampleId: A.systemId, audioUrl: A.url },
    b: { sampleId: B.systemId, audioUrl: B.url },
  };
}

/** Reveal the true vendor/model behind a `real:` pair. */
export function realReveal(pairId: string, picked?: Verdict): VoteResult["reveal"] {
  const m = load();
  const parts = pairId.split(":");
  const aId = parts[2] ?? "";
  const bId = parts[3] ?? "";
  const sys = (id: string) => m?.systems.find((s) => s.systemId === id);
  const a = sys(aId);
  const b = sys(bId);
  return {
    a: { systemId: aId, vendor: a?.vendor ?? "Unknown", modelName: a?.model ?? "" },
    b: { systemId: bId, vendor: b?.vendor ?? "Unknown", modelName: b?.model ?? "" },
    picked,
  };
}
