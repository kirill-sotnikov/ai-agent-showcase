import { describe, expect, it } from "vitest";
import { WorkspaceClient } from "../packages/web/src/transport/client";

describe("web state on the server", () => {
  it("creates a browser-independent store with a stable hydration snapshot", () => {
    const client = new WorkspaceClient();

    expect(client.state.getState()).toMatchObject({
      workspace: null,
      connection: "Connecting",
      ready: false,
      error: null,
    });

    expect(client.state.getState()).toBe(client.state.getState());
  });

  it("isolates Zustand state between workspace providers", () => {
    const first = new WorkspaceClient();
    const second = new WorkspaceClient();

    first.report(new Error("Only the first workspace failed."));

    expect(first.state.getState().error).toBe(
      "Only the first workspace failed.",
    );

    expect(second.state.getState().error).toBeNull();

    first.clearError();
    expect(first.state.getState().error).toBeNull();
  });
});
