import { initTRPC } from "@trpc/server";
import { z } from "zod";

const trpc = initTRPC.create();

export const appRouter = trpc.router({
  health: trpc.procedure
    .input(z.object({ client: z.string().trim().min(1).max(80) }))
    .output(z.object({ status: z.literal("ok"), client: z.string() }))
    .query(({ input }) => {
      return { status: "ok" as const, client: input.client };
    }),
});

export type AppRouter = typeof appRouter;
