import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Runtime data/secrets/model downloads must never become deployment trace assets.
  outputFileTracingExcludes: { "/*": ["./.local/**/*", "./.env*", "./.venv/**/*", "./test-results/**/*"] },
  serverExternalPackages: ["@electric-sql/pglite", "@electric-sql/pglite-pgvector"],
  // No "N" dev badge or error toast. The dev overlay never ships in `next build` output.
  devIndicators: false,
};

export default config;
