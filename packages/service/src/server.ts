import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import Fastify from "fastify";
import { appRouter } from "./router.js";

export const createServer = () => {
  const server = Fastify({
    logger: true,
    routerOptions: { maxParamLength: 5_000 },
  });

  server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: { router: appRouter },
  });

  server.get("/health", async () => {
    return { status: "ok" };
  });

  return server;
};
