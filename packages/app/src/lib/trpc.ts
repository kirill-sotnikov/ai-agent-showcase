import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import { type AppRouter } from "service/router";

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export const createApiClient = (url = "/api/trpc") => {
  return createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url })],
  });
};
