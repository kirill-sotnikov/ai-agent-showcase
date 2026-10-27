"use client";

import { type ReactNode, useState } from "react";
import { createAppStore } from "../stores/app-store";
import { AppStoreContext } from "../stores/app-store-context";

interface AppStoreProviderProps {
  readonly children: ReactNode;
}

export const AppStoreProvider = ({ children }: AppStoreProviderProps) => {
  // eslint-disable-next-line react/hook-use-state -- The store instance never needs replacement.
  const [store] = useState(createAppStore);

  return (
    <AppStoreContext.Provider value={store}>
      {children}
    </AppStoreContext.Provider>
  );
};
