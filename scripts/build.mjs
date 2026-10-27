import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
export const webOptions = {
  entryPoints: ["apps/web/src/main.tsx"],
  bundle: true,
  format: "esm",
  outdir: "apps/web/dist/assets",
  sourcemap: true,
  target: "es2022",
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV ?? "production",
    ),
  },
};
export const serverOptions = {
  entryPoints: ["apps/server/src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  external: [
    "fastify",
    "openai",
    "openai/*",
    "ws",
    "@fastify/websocket",
    "zod",
  ],
  outfile: "apps/server/dist/index.mjs",
};
export async function prepare() {
  await mkdir("apps/web/dist", { recursive: true });
  await copyFile("apps/web/index.html", "apps/web/dist/index.html");
}
if (process.argv[1]?.endsWith("build.mjs")) {
  await prepare();
  await Promise.all([
    build({ ...webOptions, minify: true }),
    build(serverOptions),
  ]);
}
