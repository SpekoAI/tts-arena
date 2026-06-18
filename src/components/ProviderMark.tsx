/**
 * ProviderMark — a brand logo mark for each TTS provider.
 *
 * Resolves the brand from the vendor name *or* system id by substring (so
 * "AWS Polly (Generative)", "xAI Grok Text-to-Speech", "Deepgram Aura 2" all
 * map correctly). Renders the official glyph where one is bundled
 * (brand-logos.ts), otherwise a brand-colored monogram — every provider gets a
 * recognizable, consistent mark. The human reference is a gold star.
 */

import Icon from "./Icon";
import { BRAND_LOGOS } from "@/lib/brand-logos";

type Brand = { bg: string; fg?: string; txt: string };

const BRAND: Record<string, Brand> = {
  elevenlabs: { bg: "#0B0C0E", txt: "11" },
  openai: { bg: "#10A37F", txt: "O" },
  cartesia: { bg: "#6D28D9", txt: "C" },
  xai: { bg: "#0B0C0E", txt: "X" },
  inworld: { bg: "#4F46E5", txt: "I" },
  alibaba: { bg: "#FF6A00", fg: "#2A1400", txt: "Q" },
  rime: { bg: "#111827", txt: "R" },
  hume: { bg: "#0EA5E9", txt: "H" },
  gradium: { bg: "#0D9488", txt: "G" },
  deepgram: { bg: "#101820", txt: "D" },
  minimax: { bg: "#E2342C", txt: "M" },
  amazon: { bg: "#FF9900", fg: "#1A1206", txt: "a" },
  google: { bg: "#4285F4", txt: "G" },
  microsoft: { bg: "#2563EB", txt: "Az" },
  playht: { bg: "#1A56DB", txt: "P" },
  kokoro: { bg: "#DB2777", txt: "K" },
  sesame: { bg: "#7C3AED", txt: "S" },
  miso: { bg: "#0EA5E9", txt: "M" },
};

// First match wins; checked against the lowercased vendor name + id.
const RULES: [RegExp, string][] = [
  [/elevenlabs/, "elevenlabs"],
  [/cartesia/, "cartesia"],
  [/openai/, "openai"],
  [/xai|grok/, "xai"],
  [/inworld/, "inworld"],
  [/alibaba|qwen/, "alibaba"],
  [/rime/, "rime"],
  [/hume/, "hume"],
  [/gradium/, "gradium"],
  [/deepgram/, "deepgram"],
  [/minimax/, "minimax"],
  [/polly|aws|amazon/, "amazon"],
  [/google|gemini|chirp/, "google"],
  [/microsoft|azure/, "microsoft"],
  [/playht|play\s*ht/, "playht"],
  [/kokoro/, "kokoro"],
  [/sesame/, "sesame"],
  [/miso/, "miso"],
];

function resolve(vendor: string): { brand: Brand; key: string } {
  const s = vendor.toLowerCase();
  for (const [re, key] of RULES) if (re.test(s)) return { brand: BRAND[key], key };
  const initial = vendor.replace(/[^a-zA-Z0-9]/g, "").slice(0, 1).toUpperCase() || "•";
  return { brand: { bg: "#475569", txt: initial }, key: "" };
}

export default function ProviderMark({
  vendor,
  isHuman = false,
  className = "h-7 w-7 text-[11px]",
}: {
  vendor: string;
  isHuman?: boolean;
  className?: string;
}) {
  if (isHuman) {
    return (
      <span
        className={`grid shrink-0 place-items-center rounded-md bg-human-soft text-human ${className}`}
      >
        <Icon name="star" />
      </span>
    );
  }

  const { brand, key } = resolve(vendor);
  const logoPath = BRAND_LOGOS[key];

  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-md font-bold leading-none ${className}`}
      style={{ background: brand.bg, color: brand.fg ?? "#ffffff" }}
    >
      {logoPath ? (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-[62%] w-[62%]" aria-hidden="true">
          <path d={logoPath} />
        </svg>
      ) : (
        brand.txt
      )}
    </span>
  );
}
