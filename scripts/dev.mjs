import { context } from "esbuild";
import { spawn } from "node:child_process";
import { prepare, webOptions, serverOptions } from "./build.mjs";

await prepare();

const web = await context({
  ...webOptions,
  define: { "process.env.NODE_ENV": '"development"' },
});

const server = await context(serverOptions);

await Promise.all([web.watch(), server.watch(), server.rebuild()]);

const child = spawn(
  process.execPath,
  ["--watch", "--env-file-if-exists=.env", "apps/server/dist/index.mjs"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
      ...(process.argv.includes("--fake") ? { LLM_PROVIDER: "fake" } : {}),
    },
  },
);

for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    child.kill(signal);
    await Promise.all([web.dispose(), server.dispose()]);
  });
