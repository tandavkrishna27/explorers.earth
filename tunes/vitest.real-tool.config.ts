import { defineConfig, configDefaults } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@shared": path.resolve(__dirname, "shared") } },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./server/test/setup.ts"],
    include: ["**/*.real-tool.test.ts"],
    exclude: [...configDefaults.exclude],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
