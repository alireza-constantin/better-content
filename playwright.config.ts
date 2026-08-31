import { defineConfig, devices } from "@playwright/test";

import { getE2eDatabaseUrl } from "./src/db/e2e-environment";

// Validate before starting a server that can reset test state. The server does
// the same validation immediately before it connects to PostgreSQL.
getE2eDatabaseUrl(process.env);

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;
const browserChannel =
  process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? (process.platform === "win32" ? "chrome" : undefined);

export default defineConfig({
  testDir: "./e2e",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      // Windows can use installed Chrome where the Playwright CDN is blocked;
      // CI and other hosts retain Playwright's downloaded Chromium default.
      use: { ...devices["Desktop Chrome"], ...(browserChannel ? { channel: browserChannel } : {}) },
    },
  ],
  webServer: {
    command: "node --env-file-if-exists=.env.local --import tsx ./scripts/start-e2e-server.ts",
    env: {
      ...process.env,
      PLAYWRIGHT_PORT: String(port),
    },
    reuseExistingServer: false,
    url: baseURL,
    timeout: 120_000,
  },
});
