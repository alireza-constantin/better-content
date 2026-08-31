import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // PostgreSQL integration files share TEST_DATABASE_URL and truncate it between cases.
    fileParallelism: false,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
