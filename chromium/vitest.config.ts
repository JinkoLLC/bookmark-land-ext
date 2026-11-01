import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@convex": path("convex-api"), "@": path(".") },
  },
  test: {
    include: ["{utils,components,entrypoints}/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
  },
});
