import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Pin TZ=UTC so date-sensitive tests behave identically on dev machines and CI.
process.env.TZ = "UTC";

export default defineConfig({
  // esbuild (padrão do Vitest) não emite `design:paramtypes`, e o Nest injeta
  // por tipo do construtor. O SWC emite.
  plugins: [
    swc.vite({
      module: { type: "es6" },
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
  },
});
