import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;

// The e2e run gets its own database and the deterministic mock answer provider (no API key needed).
const e2eDb = new URL(process.env.DATABASE_URL || "postgres://localhost:5432/documind");
e2eDb.pathname = "/documind_e2e";
process.env.E2E_DATABASE_URL ??= e2eDb.toString();

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  workers: 1, // one shared database
  timeout: 120_000,
  expect: { timeout: 60_000 }, // the first ingestion may download the embedding model
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.CI ? `npm run start -- -p ${PORT}` : `npx next dev -p ${PORT}`,
    // Not /api/health: Playwright starts the server before globalSetup has created the database.
    url: `http://localhost:${PORT}/`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { DATABASE_URL: process.env.E2E_DATABASE_URL, LLM_PROVIDER: "mock" },
  },
});
