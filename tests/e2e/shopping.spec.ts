import { expect, test, type Page } from "@playwright/test";

const key = "ai-shopping-assistant:v1";

async function send(page: Page, message: string) {
  await page.getByLabel("Message", { exact: true }).fill(message);

  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeEnabled();

  await page.getByRole("button", { name: "Send", exact: true }).click();
}

async function completed(page: Page) {
  await expect(page.getByTestId("run-status")).toContainText("Completed");
}

test("search → cheapest commit → partial remove → reload", async ({ page }) => {
  await page.goto("/");
  await send(page, "Find a lamp under $50 and add the cheapest one.");
  await completed(page);

  const cart = page.getByRole("region", { name: "Cart", exact: true });

  await expect(
    cart.getByRole("heading", { name: "Arc Desk Lamp" }),
  ).toBeVisible();

  await expect(cart.getByTestId("cart-total")).toContainText("$39.00");
  await send(page, "Add two of the blue mugs.");
  await completed(page);

  await expect(
    cart.getByLabel("Blue Ceramic Mug quantity", { exact: true }),
  ).toHaveValue("2");

  await send(page, "Remove one blue mug.");
  await completed(page);

  await expect(
    cart.getByLabel("Blue Ceramic Mug quantity", { exact: true }),
  ).toHaveValue("1");

  await page.reload();
  await expect(cart.getByTestId("cart-total")).toContainText("$57.00");

  await expect(
    cart.getByLabel("Blue Ceramic Mug quantity", { exact: true }),
  ).toHaveValue("1");

  await expect(
    page.locator('[data-message-role="assistant"]').last(),
  ).toContainText("Cart saved.");
});

test("clarifies an ambiguous item and accepts a short follow-up", async ({
  page,
}) => {
  await page.goto("/");
  await send(page, "Add the headphones.");

  await expect(page.getByTestId("run-status")).toContainText(
    "Waiting for clarification",
  );

  await expect(
    page.getByRole("heading", { name: "Your cart is empty" }),
  ).toBeVisible();

  await send(page, "Cloud");
  await completed(page);
  await expect(page.getByTestId("cart-total")).toContainText("$89.00");
});

test("identity and product CRUD persist, including an empty catalog", async ({
  page,
}) => {
  page.on("dialog", (dialog) => {
    void dialog.accept();
  });

  await page.goto("/settings");
  await expect(page.getByLabel("Agent identity")).toBeVisible();

  await page
    .getByLabel("Agent identity")
    .fill("You are a concise lighting specialist.");

  await page.getByRole("button", { name: "Save identity" }).click();

  await expect(
    page.getByRole("button", { name: "Saved", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add product", exact: true }).click();

  await page
    .getByLabel("Product name", { exact: true })
    .fill("Oak Reading Light");

  await page.getByLabel("Price (USD)").fill("25.95");

  await page
    .getByLabel("Description", { exact: true })
    .fill("An oak lamp for a quiet corner.");

  await page.getByLabel("Category", { exact: true }).fill("Lighting");
  await page.getByLabel("Attributes", { exact: true }).fill("color: Oak");
  await page.getByRole("button", { name: "Save product" }).click();

  await expect(
    page.getByRole("heading", { name: "Oak Reading Light" }),
  ).toBeVisible();

  await page.reload();

  await expect(page.getByLabel("Agent identity")).toHaveValue(
    "You are a concise lighting specialist.",
  );

  const product = page
    .getByTestId("catalog-item")
    .filter({ hasText: "Oak Reading Light" });

  await product.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Price (USD)").fill("29.99");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(product).toContainText("$29.99");

  const deleteButtons = page.getByRole("button", {
    name: "Delete",
    exact: true,
  });

  for (let count = await deleteButtons.count(); count > 0; count--) {
    await deleteButtons.first().click();
    await expect(deleteButtons).toHaveCount(count - 1);
  }

  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Your catalog is empty" }),
  ).toBeVisible();
});

test("quota failure rejects proposal without a saved change", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("status").filter({ hasText: "Connected" }),
  ).toBeVisible();

  await page.evaluate(() => {
    const original = Storage.prototype.setItem;

    Storage.prototype.setItem = function (name, value) {
      if (JSON.parse(value).commitReceipts?.length > 0)
        throw new DOMException("Quota exceeded", "QuotaExceededError");

      return original.call(this, name, value);
    };
  });

  await send(page, "Add the Arc Desk Lamp");
  await expect(page.getByTestId("run-status")).toContainText("Failed");

  await expect(
    page.getByRole("heading", { name: "Your cart is empty" }),
  ).toBeVisible();

  const state = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    key,
  );

  expect(state.commitReceipts).toHaveLength(0);
  expect(state.cart.items).toHaveLength(0);
});

test("lost ACK and reload preserve committed cart without replay", async ({
  page,
}) => {
  await page.routeWebSocket("**/ws", (ws) => {
    const server = ws.connectToServer();

    ws.onMessage((message) => {
      if (JSON.parse(String(message)).type !== "cart.commit_ack")
        server.send(message);
    });
  });

  await page.goto("/");
  await send(page, "Add the Arc Desk Lamp");
  await expect(page.getByTestId("cart-total")).toContainText("$39.00");
  await page.reload();
  await expect(page.getByTestId("run-status")).toContainText("Interrupted");

  await expect(
    page.locator('[data-message-role="assistant"]').last(),
  ).toContainText("Cart saved. 1 item, total $39.00. Response interrupted.");

  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).commitReceipts.length,
      key,
    ),
  ).toBe(1);
});

test("another tab cannot edit during a run and Stop wins before proposal", async ({
  page,
  context,
}) => {
  let held: (() => void) | undefined;

  await page.routeWebSocket("**/ws", (ws) => {
    const server = ws.connectToServer();

    server.onMessage((message) => {
      if (JSON.parse(String(message)).type === "cart.proposed")
        held = () => ws.send(message);
      else ws.send(message);
    });
  });

  await page.goto("/");

  const other = await context.newPage();

  await other.goto("/settings");
  await send(page, "Add the Arc Desk Lamp");
  await expect.poll(() => !!held).toBe(true);

  await expect(
    other.getByRole("button", { name: "Save identity" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Stop", exact: true }).click();
  held!();
  await expect(page.getByTestId("run-status")).toContainText("Cancelled");

  await expect(
    page.getByRole("heading", { name: "Your cart is empty" }),
  ).toBeVisible();

  await expect(
    other.getByRole("button", { name: "Save identity" }),
  ).toBeEnabled();
});

test("stale proposal cannot overwrite a newer revision", async ({ page }) => {
  let release!: () => void;

  await page.routeWebSocket("**/ws", (ws) => {
    const server = ws.connectToServer();

    server.onMessage((message) => {
      if (JSON.parse(String(message)).type === "cart.proposed")
        release = () => ws.send(message);
      else ws.send(message);
    });
  });

  await page.goto("/");
  await send(page, "Add the Arc Desk Lamp");
  await expect.poll(() => !!release).toBe(true);

  await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key)!);

    state.stateRevision++;
    localStorage.setItem(key, JSON.stringify(state));
  }, key);

  release();
  await expect(page.getByTestId("run-status")).toContainText("Failed");

  await expect(
    page.getByRole("heading", { name: "Your cart is empty" }),
  ).toBeVisible();
});

test("duplicate proposal is idempotent", async ({ page }) => {
  await page.routeWebSocket("**/ws", (ws) => {
    const server = ws.connectToServer();

    server.onMessage((message) => {
      ws.send(message);
      if (JSON.parse(String(message)).type === "cart.proposed")
        ws.send(message);
    });
  });

  await page.goto("/");
  await send(page, "Add the Arc Desk Lamp");
  await completed(page);

  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).cart.items[0].quantity,
      key,
    ),
  ).toBe(1);
});

test("corrupt data requires an explicit reset", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((key) => localStorage.setItem(key, "{broken"), key);
  await page.reload();

  await expect(page.getByTestId("workspace-error")).toContainText(
    "Unable to load saved data",
  );

  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    "{broken",
  );

  page.on("dialog", (dialog) => {
    void dialog.accept();
  });

  await page.getByRole("button", { name: "Reset saved data" }).click();

  await expect(
    page.getByRole("heading", { name: "How can I help you shop today?" }),
  ).toBeVisible();
});

test("desktop proportions, mobile layout and plain-text rendering", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  const chat = await page
    .getByRole("region", { name: "Assistant chat" })
    .boundingBox();

  const cart = await page
    .getByRole("region", { name: "Cart", exact: true })
    .boundingBox();

  expect(Math.abs(chat!.width - cart!.width)).toBeLessThan(2);

  await page.screenshot({
    path: "test-results/assistant-desktop.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });

  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeVisible();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  await page.screenshot({
    path: "test-results/assistant-mobile.png",
    fullPage: true,
  });

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Agent identity")).toBeVisible();
});

test("Next navigation preserves the active request and one WebSocket connection", async ({
  page,
}) => {
  let connections = 0;

  let release: (() => void) | undefined;

  await page.routeWebSocket("**/ws", (ws) => {
    connections++;

    const server = ws.connectToServer();

    server.onMessage((message) => {
      if (JSON.parse(String(message)).type === "cart.proposed")
        release = () => ws.send(message);
      else ws.send(message);
    });
  });

  const response = await page.goto("/");
  const policy = response!.headers()["content-security-policy"];

  expect(policy).toContain("script-src 'self' 'nonce-");
  if (process.env.E2E_DEV !== "1")
    expect(policy).not.toContain("'unsafe-inline'");

  await send(page, "Add the Arc Desk Lamp");
  await expect.poll(() => !!release).toBe(true);
  await page.getByRole("link", { name: "Settings", exact: true }).click();

  await expect(
    page.getByRole("button", { name: "Save identity" }),
  ).toBeDisabled();

  await page.getByRole("link", { name: "Assistant", exact: true }).click();

  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();

  release!();
  await completed(page);
  await expect(page.getByTestId("cart-total")).toContainText("$39.00");
  expect(connections).toBe(1);
});
