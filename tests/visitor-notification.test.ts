import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../packages/service/src/server.js";
import { readConfig } from "../packages/service/src/config/index.js";
import {
  initialState,
  STORAGE_KEY,
} from "../packages/web/src/storage/store.js";
import { WorkspaceClient } from "../packages/web/src/transport/client.js";
import { MemoryStorage, TestLocks } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

describe("first visit", () => {
  function browser(saved?: string) {
    const storage = new MemoryStorage();
    const locks = new TestLocks();

    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));

    if (saved !== undefined) storage.setItem(STORAGE_KEY, saved);

    vi.stubGlobal("window", {
      localStorage: storage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    vi.stubGlobal("navigator", {
      locks: {
        request: (
          name: string,
          options: { ifAvailable: boolean },
          task: (lock: object) => unknown,
        ) => locks.run(name, options.ifAvailable, () => task({})),
      },
    });

    vi.stubGlobal("location", { protocol: "http:", host: "test.local" });

    vi.stubGlobal(
      "WebSocket",
      class {
        close() {}
      },
    );

    vi.stubGlobal("fetch", fetch);

    return { storage, fetch };
  }

  it("notifies once across concurrent initialization and only welcomes the creating tab", async () => {
    const { storage, fetch } = browser();
    const first = new WorkspaceClient();
    const second = new WorkspaceClient();

    await Promise.all([first.initialize(), second.initialize()]);
    first.dispose();
    await first.initialize();

    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);

    expect(fetch).toHaveBeenCalledWith("/api/visitors/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String),
      keepalive: true,
    });

    const event = JSON.parse(fetch.mock.calls[0][1].body);

    expect(Number.isNaN(Date.parse(event.occurredAt))).toBe(false);
    expect(first.state.getState().showWelcome).toBe(true);
    expect(second.state.getState().showWelcome).toBe(false);
    first.dismissWelcome();
    expect(first.state.getState().showWelcome).toBe(false);

    first.dispose();
    second.dispose();
  });

  it.each([JSON.stringify(initialState()), "{broken"])(
    "does not notify or welcome when saved data already exists (%#)",
    async (saved) => {
      const { fetch } = browser(saved);
      const client = new WorkspaceClient();

      await client.initialize();
      expect(fetch).not.toHaveBeenCalled();
      expect(client.state.getState().showWelcome).toBe(false);
      client.dispose();
    },
  );

  it("keeps the workspace usable if the notification request fails", async () => {
    const { fetch } = browser();

    fetch.mockRejectedValue(new Error("Offline"));

    const client = new WorkspaceClient();

    await client.initialize();

    expect(client.state.getState()).toMatchObject({
      workspace: expect.any(Object),
      showWelcome: true,
      loadError: false,
      error: null,
    });

    client.dispose();
  });
});

describe("visitor notification endpoint", () => {
  const occurredAt = "2026-10-28T08:09:10.000Z";

  async function request(
    options: {
      configured?: boolean;
      telegram?: { TG_NOTIFY_BOT_TOKEN?: string; TG_NOTIFY_BOT_CHAT?: string };
      origin?: string;
      payload?: unknown;
    } = {},
  ) {
    const server = createServer(
      readConfig({
        NODE_ENV: "test",
        LLM_PROVIDER: "fake",
        ALLOWED_ORIGINS: "http://test.local",
        ...(options.configured !== false
          ? { TG_NOTIFY_BOT_TOKEN: "test-token", TG_NOTIFY_BOT_CHAT: "1234" }
          : {}),
        ...options.telegram,
      }),
    );

    try {
      return await server.inject({
        method: "POST",
        url: "/api/visitors/new",
        headers: { origin: options.origin ?? "http://test.local" },
        payload: options.payload ?? { occurredAt },
      });
    } finally {
      await server.close();
    }
  }

  it("sends the requested Telegram message without a date or time", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));

    vi.stubGlobal("fetch", fetch);

    const response = await request();

    expect(response.statusCode).toBe(204);
    expect(fetch).toHaveBeenCalledTimes(1);

    expect(fetch.mock.calls[0][0]).toBe(
      "https://api.telegram.org/bottest-token/sendMessage",
    );

    const message = JSON.parse(fetch.mock.calls[0][1].body);

    expect(message).toEqual({
      chat_id: "1234",
      text: "[AI Agent Showcase] Новый посетитель",
    });
  });

  it.each([
    {},
    { TG_NOTIFY_BOT_TOKEN: "test-token" },
    { TG_NOTIFY_BOT_CHAT: "1234" },
    { TG_NOTIFY_BOT_TOKEN: "test-token", TG_NOTIFY_BOT_CHAT: "  " },
  ])(
    "reports unavailable delivery for incomplete Telegram settings (%#)",
    async (telegram) => {
      const fetch = vi.fn();

      vi.stubGlobal("fetch", fetch);

      expect((await request({ configured: false, telegram })).statusCode).toBe(
        503,
      );

      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("rejects untrusted origins and invalid events before calling Telegram", async () => {
    const fetch = vi.fn();

    vi.stubGlobal("fetch", fetch);

    expect((await request({ origin: "http://evil.local" })).statusCode).toBe(
      403,
    );

    expect(
      (await request({ payload: { occurredAt: "invalid" } })).statusCode,
    ).toBe(400);

    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["network", "http", "api"])(
    "handles Telegram %s failures without exposing the token",
    async (failure) => {
      const fetch = vi.fn();

      if (failure === "network")
        fetch.mockRejectedValue(new Error("test-token"));
      else
        fetch.mockResolvedValue(
          Response.json(
            { ok: false },
            {
              status: failure === "http" ? 500 : 200,
            },
          ),
        );
      vi.stubGlobal("fetch", fetch);

      const response = await request();

      expect(response.statusCode).toBe(502);
      expect(response.body).not.toContain("test-token");
    },
  );
});
