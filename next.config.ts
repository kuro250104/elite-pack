import type { NextConfig } from "next";
const nextConfig: NextConfig = { poweredByHeader: false, distDir: process.env.PLAYWRIGHT_TEST_SERVER === "1" ? ".next-e2e" : ".next" };
export default nextConfig;
