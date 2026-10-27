import { createVanillaExtractPlugin } from "@vanilla-extract/next-plugin";
import type { NextConfig } from "next";

const withVanillaExtract = createVanillaExtractPlugin();
const serviceUrl = process.env.SERVICE_URL ?? "http://127.0.0.1:3001";

const config: NextConfig = {
  transpilePackages: ["@shop/shared"],
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };

    return config;
  },
  async rewrites() {
    return ["/ws", "/health", "/ready"].map((source) => ({
      source,
      destination: `${serviceUrl}${source}`,
    }));
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default withVanillaExtract(config);
