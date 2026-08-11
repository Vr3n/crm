import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@common": resolve("src/common"),
      "@main": resolve("src/main"),
    },
  },
});
