"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import { WorkspaceClient, type ViewState } from "./transport/client";
import { isRunning } from "./storage/store";

const WorkspaceContext = createContext<WorkspaceClient | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new WorkspaceClient());

  useEffect(() => {
    void client.initialize();

    return () => client.dispose();
  }, [client]);

  return (
    <WorkspaceContext.Provider value={client}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceClient() {
  const client = useContext(WorkspaceContext);

  if (!client) throw new Error("WorkspaceProvider is required.");

  return client;
}

export function useWorkspace<T>(selector: (state: ViewState) => T) {
  const client = useWorkspaceClient();

  return useStore(client.state, selector);
}

export function useWorkspaceActions() {
  const client = useWorkspaceClient();
  const workspace = useWorkspace((state) => state.workspace);
  const busy = workspace ? isRunning(workspace) : false;
  const disabled = busy || typeof navigator === "undefined" || !navigator.locks;

  const act = (operation: () => Promise<unknown>) => {
    client.clearError();
    void operation().catch((error) => client.report(error));
  };

  return { workspace, busy, disabled, act };
}
