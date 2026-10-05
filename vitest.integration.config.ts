import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** Tests with a live dependency (local Supabase, Plaid sandbox). See package.json. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.it.test.ts", "src/**/*.contract.test.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/server-only.ts", import.meta.url)),
    },
  },
});
