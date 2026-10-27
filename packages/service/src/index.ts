import { readConfig } from "./config.js";
import { createServer } from "./server.js";

const server = createServer();

try {
  await server.listen(readConfig());

  let stopping = false;

  const shutdown = async () => {
    if (stopping) return;
    stopping = true;

    try {
      await server.close();
    } catch (error) {
      server.log.error(error);
      process.exitCode = 1;
    }
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown();
    });
  }
} catch (error) {
  server.log.error(error);
  await server.close();
  process.exitCode = 1;
}
