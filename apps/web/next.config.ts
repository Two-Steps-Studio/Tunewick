import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    resolveAlias: {
      // Equivalent of next-intl's `createNextIntlPlugin("./src/i18n/request.ts")`.
      // The plugin is not used because it eagerly loads @swc/core (needed only for its
      // optional message extractor), whose native binding fails to load on some Windows
      // setups. Revisit when message extraction is wanted.
      "next-intl/config": "./src/i18n/request.ts",
    },
  },
};

export default nextConfig;
