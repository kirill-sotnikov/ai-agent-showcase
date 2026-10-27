import { createStore } from "zustand/vanilla";
import { createApiClient, type RouterOutputs } from "../lib/trpc";

interface AppState {
  readonly connection: "idle" | "checking" | "connected" | "error";
  readonly health: RouterOutputs["health"] | null;
  readonly error: string | null;
  readonly checkConnection: () => Promise<void>;
}

export const createAppStore = () => {
  const api = createApiClient();

  return createStore<AppState>()((set, get) => ({
    connection: "idle",
    health: null,
    error: null,
    checkConnection: async () => {
      if (get().connection === "checking") return;
      set({ connection: "checking", health: null, error: null });

      try {
        const health = await api.health.query({ client: "app" });

        set({ connection: "connected", health });
      } catch {
        set({
          connection: "error",
          error: "Could not reach the service. Please try again.",
        });
      }
    },
  }));
};

export type AppStore = ReturnType<typeof createAppStore>;
