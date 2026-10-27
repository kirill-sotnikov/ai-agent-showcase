"use client";

import { useWorkspaceActions } from "../../workspace";
import { Settings } from "./settings";

export function SettingsPage() {
  const { workspace, disabled, act } = useWorkspaceActions();

  return workspace ? (
    <Settings state={workspace} disabled={disabled} act={act} />
  ) : null;
}
