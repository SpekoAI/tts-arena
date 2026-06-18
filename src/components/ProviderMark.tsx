/**
 * ProviderMark — a brand logo mark for each TTS provider.
 *
 * Renders the official glyph (bundled from simple-icons) where one exists, and
 * a brand-colored monogram everywhere else — OpenAI, Microsoft, Amazon and the
 * niche startups aren't in any open icon set. All marks sit on a brand-colored
 * chip so the set reads as one consistent system. To force a real logo, add its
 * path to brand-logos.ts (or swap this for an <img> from /public/logos).
 */

import Icon from "./Icon";
import { BRAND_LOGOS } from "@/lib/brand-logos";

type Brand = { bg: string; fg?: string; txt: string };

const BRAND: Record<string, Brand> = {
  openai: { bg: "#0F9D77", txt: "O" },
  elevenlabs: { bg: "#0B0C0E", txt: "11" },
  hume: { bg: "#0EA5E9", txt: "H" },
  cartesia: { bg: "#6D28D9", txt: "C" },
  minimax: { bg: "#E2342C", txt: "M" },
  google: { bg: "#4285F4", txt: "G" },
  playht: { bg: "#1A56DB", txt: "P" },
  rime: { bg: "#111827", txt: "R" },
  microsoft: { bg: "#2563EB", txt: "Az" },
  deepgram: { bg: "#0B0C0E", txt: "D" },
  kokoro: { bg: "#DB2777", txt: "K" },
  amazon: { bg: "#FF9900", fg: "#1A1206", txt: "a" },
  sesame: { bg: "#7C3AED", txt: "S" },
};

function keyFor(vendor: string): string {
  return vendor.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function brandFor(vendor: string): Brand {
  return BRAND[keyFor(vendor)] ?? { bg: "#475569", txt: vendor.slice(0, 1).toUpperCase() };
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

  const b = brandFor(vendor);
  const logoPath = BRAND_LOGOS[keyFor(vendor)];

  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-md font-bold leading-none ${className}`}
      style={{ background: b.bg, color: b.fg ?? "#ffffff" }}
    >
      {logoPath ? (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-[62%] w-[62%]" aria-hidden="true">
          <path d={logoPath} />
        </svg>
      ) : (
        b.txt
      )}
    </span>
  );
}
