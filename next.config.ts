import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloud Run: emit a self-contained server bundle in .next/standalone
  output: "standalone",
};

export default nextConfig;
