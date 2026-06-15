import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Single accent color for the whole arena.
        accent: {
          DEFAULT: "#6366f1",
          hover: "#818cf8",
          muted: "#4f46e5",
        },
      },
    },
  },
  plugins: [],
};

export default config;
