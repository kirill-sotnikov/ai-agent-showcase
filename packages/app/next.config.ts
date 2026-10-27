import { createVanillaExtractPlugin } from "@vanilla-extract/next-plugin";
import { type NextConfig } from "next";

const withVanillaExtract = createVanillaExtractPlugin();
const serviceUrl = process.env.SERVICE_URL ?? "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/trpc/:path*",
        destination: `${serviceUrl}/trpc/:path*`,
      },
    ];
  },
};

export default withVanillaExtract(nextConfig);
