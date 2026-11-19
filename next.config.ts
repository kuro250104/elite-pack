import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.PLAYWRIGHT_TEST_SERVER === "1" ? ".next-e2e" : ".next",
  // Minimal self-contained server for the Docker image only; local builds and Vercel keep the default output.
  output: process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,
  experimental: { agentUpgrade: "security" },
};
export default nextConfig;
