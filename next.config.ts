import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloud Run: emit a self-contained server bundle in .next/standalone
  output: "standalone",
  // This project is the workspace root; pin it so Next doesn't infer the parent
  // directory (which has its own stray lockfile) and warn about it.
  outputFileTracingRoot: __dirname,
  // The arena reads content/samples.json at runtime (real-clip manifest).
  // Serverless platforms (Vercel) only bundle files that are explicitly traced,
  // so list it for every route that reads it (API + pages that render the banner).
  outputFileTracingIncludes: {
    "/api/pair": ["./content/samples.json"],
    "/api/vote": ["./content/samples.json"],
    "/": ["./content/samples.json"],
    "/leaderboard": ["./content/samples.json"],
    "/vote": ["./content/samples.json"],
  },
};

export default nextConfig;
