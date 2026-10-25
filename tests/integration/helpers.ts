import { afterAll } from "vitest";
import { getContainer } from "@/container";

/**
 * The app's real composition root, pointed at the test database (see vitest.config.ts).
 * The pool is closed after the file and the cached singletons dropped, so the next file starts fresh.
 */
export function setupContainer() {
  const container = getContainer();
  afterAll(async () => {
    await container.pool.end();
    const globals = globalThis as { documindContainer?: unknown; documindPool?: unknown };
    delete globals.documindContainer;
    delete globals.documindPool;
  });
  return container;
}

export async function resetDatabase(container: ReturnType<typeof getContainer>): Promise<void> {
  await container.pool.query("TRUNCATE documents, conversations CASCADE");
}
