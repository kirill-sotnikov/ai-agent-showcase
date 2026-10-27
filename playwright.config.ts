import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: {
    command:
      "yarn build && NODE_ENV=test LLM_PROVIDER=fake PORT=3100 ALLOWED_ORIGINS=http://127.0.0.1:3100 yarn start",
    url: "http://127.0.0.1:3100/health",
    reuseExistingServer: false,
  },
});
