"use client";

import { createContext, useContext } from "react";
import { useStore } from "zustand";
import { type AppStore } from "./app-store";

export const AppStoreContext = createContext<AppStore | null>(null);

export const useAppStore = <Value>(
  selector: (state: ReturnType<AppStore["getState"]>) => Value,
): Value => {
  const store = useContext(AppStoreContext);

  if (!store) {
    throw new Error("useAppStore must be used within AppStoreProvider");
  }

  return useStore(store, selector);
};
