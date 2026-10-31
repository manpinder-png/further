import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // No "N" dev badge or error toast. The dev overlay never ships in `next build` output.
  devIndicators: false,
  // Friendly MCP endpoint for the client config shown in Profile → Connected apps.
  async rewrites() {
    return [{ source: "/mcp", destination: "/api/mcp" }];
  },
};

export default config;
