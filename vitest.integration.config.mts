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
    // These files share one mutable PostgreSQL database and each owns a whole-database reset.
    // Keep only this integration group sequential; unit and UI tests remain parallel.
    fileParallelism: false,
    include: ["src/**/*.integration.test.ts"],
  },
});
