import { readConfig } from "./config/index.js";
import { createServer } from "./server.js";

try {
  const config = readConfig();
  const server = createServer(config);

  await server.listen({ host: config.HOST, port: config.PORT });

  let stopping = false;

  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      if (stopping) return;
      stopping = true;

      void server.close().catch(() => {
        process.exitCode = 1;
      });
    });
} catch {
  console.error(
    "Unable to start the server. Check the server environment configuration and port.",
  );

  process.exitCode = 1;
}
