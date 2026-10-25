import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, "src") };

// Integration tests own a separate database (default: `documind_test` on the dev server) they can truncate.
const testDb = new URL(process.env.DATABASE_URL || "postgres://localhost:5432/documind");
testDb.pathname = "/documind_test";
process.env.TEST_DATABASE_URL ??= testDb.toString();

export default defineConfig({
  resolve: { alias },
  test: {
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["src/app/**/page.tsx", "src/**/*.d.ts"],
    },
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          env: { DATABASE_URL: process.env.TEST_DATABASE_URL, LLM_PROVIDER: "mock" },
          // One shared database: files run one at a time, and the first run may download the model.
          fileParallelism: false,
          testTimeout: 120_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
