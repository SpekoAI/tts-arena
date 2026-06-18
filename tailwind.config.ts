import type { Config } from "tailwindcss";

/**
 * Design system — Speko brand (current: sky / blue / navy).
 *
 * Airy light-cool canvas behind a live drifting sky gradient, navy ink, a
 * confident Speko blue accent, and black pill CTAs (Speko style). Inter
 * throughout, monospace for data.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: "#F4F7FE",
          deep: "#E8EEFA",
        },
        card: "#FFFFFF",
        ink: {
          DEFAULT: "#0B1B2B",
          soft: "#41506A",
          muted: "#647389",
          faint: "#94A1B5",
        },
        hair: {
          DEFAULT: "rgba(11,27,43,0.06)",
          strong: "rgba(11,27,43,0.11)",
        },
        accent: {
          DEFAULT: "#2563EB", // Speko blue
          hover: "#1D4ED8",
          soft: "#E7EEFF",
          ink: "#FFFFFF",
          glow: "#60A5FA",
        },
        human: {
          DEFAULT: "#C77D12",
          soft: "#FBEFD7",
          deep: "#8A560B",
        },
        win: "#10B981",
        danger: "#E0544F",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      letterSpacing: {
        label: "0.12em",
        tightest: "-0.03em",
      },
      borderRadius: {
        "4xl": "1.75rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(11,27,43,.04), 0 12px 30px -16px rgba(11,27,43,.18)",
        lift: "0 2px 6px rgba(11,27,43,.06), 0 26px 64px -26px rgba(11,27,43,.28)",
        ring: "0 0 0 4px rgba(37,99,235,.14)",
      },
      keyframes: {
        riseIn: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        floaty: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        rise: "riseIn .6s cubic-bezier(.2,.7,.2,1) both",
        fade: "fadeIn .8s ease both",
        floaty: "floaty 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
