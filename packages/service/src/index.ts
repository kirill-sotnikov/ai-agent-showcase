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
} catch (error) {
  const code =
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "STARTUP_ERROR";

  console.error(
    code === "EADDRINUSE"
      ? "Unable to start the service (EADDRINUSE): the port is already in use. Check PORT in .env; Fastify defaults to 3001 and Next.js to 3000."
      : `Unable to start the service (${code}). Check the server environment configuration and port.`,
  );

  process.exitCode = 1;
}
