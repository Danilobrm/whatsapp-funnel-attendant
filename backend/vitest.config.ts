import { defineConfig } from "vitest/config";

// Pin TZ=UTC so date-sensitive tests behave identically on dev machines and CI.
process.env.TZ = "UTC";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
  },
});
