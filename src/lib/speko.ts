/**
 * Minimal Speko API client for the arena (server-side only).
 *
 * Mirrors the Speko SDK surface we need: the real provider/model catalog, the
 * voice catalog, and synthesis. Base + key come from env so nothing is
 * hard-coded:
 *   SPEKO_API_KEY   — Bearer token (required for real data)
 *   SPEKO_API_BASE  — defaults to the hosted gateway https://api.speko.dev
 *
 * Used by scripts/sync-speko.ts (pull real TTS models) and the sample-synth
 * pipeline. When no key is set, the arena stays in DEMO_MODE.
 */

const BASE = (process.env.SPEKO_API_BASE ?? "https://api.speko.dev").replace(/\/$/, "");
const KEY = process.env.SPEKO_API_KEY ?? "";

export const spekoConfigured = (): boolean => KEY.length > 0;

function authHeaders(json = true): Record<string, string> {
  return {
    Authorization: `Bearer ${KEY}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export interface SpekoModel {
  id: string;
  capabilities?: {
    openSource?: boolean;
    license?: string;
    [k: string]: unknown;
  };
}

export interface SpekoProvider {
  key: string;
  type: "stt" | "llm" | "tts" | "s2s";
  name: string;
  models?: SpekoModel[];
  configured?: boolean;
}

export interface SpekoVoice {
  vendor: string;
  id: string;
  name: string;
}

/** GET /v1/providers — the real, account-scoped provider + model catalog. */
export async function listProviders(): Promise<SpekoProvider[]> {
  const res = await fetch(`${BASE}/v1/providers`, { headers: authHeaders(false) });
  if (!res.ok) throw new Error(`GET /v1/providers → ${res.status}: ${await res.text()}`);
  return (await res.json()) as SpekoProvider[];
}

/** TTS providers only (configured), shaped for the arena. */
export async function listTtsProviders(): Promise<SpekoProvider[]> {
  const all = await listProviders();
  return all.filter((p) => p.type === "tts" && p.configured !== false);
}

/** GET /v1/voices — the curated voice catalog (optionally per provider). */
export async function listVoices(provider?: string): Promise<SpekoVoice[]> {
  const qs = provider ? `?provider=${encodeURIComponent(provider)}` : "";
  const res = await fetch(`${BASE}/v1/voices${qs}`, { headers: authHeaders(false) });
  if (!res.ok) throw new Error(`GET /v1/voices → ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as SpekoVoice[] | { voices?: SpekoVoice[] };
  return Array.isArray(body) ? body : (body.voices ?? []);
}

export interface SynthResult {
  bytes: Uint8Array;
  contentType: string;
  provider: string;
  model: string;
}

/**
 * POST /v1/synthesize — render `text` to audio. Pin a specific provider/model
 * with `model: "provider:model"` (Speko accepts the bare "provider:model"
 * form). Returns the raw bytes plus the resolved provider/model and the
 * content type (ElevenLabs → audio/mpeg, Cartesia → audio/pcm;rate=24000).
 */
export async function synthesize(
  text: string,
  opts: {
    language?: string;
    region?: string;
    optimizeFor?: "latency" | "quality" | "cost";
    voice?: string;
    model?: string;
    /** Pin the TTS provider(s) — routing keys, e.g. ["cartesia"]. */
    providers?: string[];
  },
): Promise<SynthResult> {
  const intent = {
    language: opts.language ?? "en",
    ...(opts.region ? { region: opts.region } : {}),
    ...(opts.optimizeFor ? { optimizeFor: opts.optimizeFor } : {}),
  };
  const body: Record<string, unknown> = { text, intent };
  if (opts.voice) body.voice = opts.voice;
  if (opts.model) body.model = opts.model;
  if (opts.providers && opts.providers.length) {
    body.constraints = { allowedProviders: { tts: opts.providers } };
  }

  const res = await fetch(`${BASE}/v1/synthesize`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST /v1/synthesize → ${res.status}: ${await res.text()}`);

  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
    provider: res.headers.get("x-speko-provider") ?? "unknown",
    model: res.headers.get("x-speko-model") ?? "unknown",
  };
}
