import { defineConfig } from "@playwright/test";

const development = process.env.E2E_DEV === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: {
    env: { TG_NOTIFY_BOT_TOKEN: "", TG_NOTIFY_BOT_CHAT: "" },
    command: development
      ? "NODE_ENV=development LLM_PROVIDER=fake WEB_PORT=3100 PORT=3101 SERVICE_URL=http://127.0.0.1:3101 ALLOWED_ORIGINS=http://127.0.0.1:3100 yarn dev"
      : "SERVICE_URL=http://127.0.0.1:3101 yarn build && NODE_ENV=test LLM_PROVIDER=fake WEB_PORT=3100 PORT=3101 ALLOWED_ORIGINS=http://127.0.0.1:3100 yarn start",
    url: "http://127.0.0.1:3100",
    timeout: 180000,
    reuseExistingServer: false,
  },
});
