import { defineConfig } from "vitest/config";
import path from "node:path";

// Runs only against Firebase emulators. Use: npm run test:emulator
export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      { find: "server-only", replacement: path.resolve(__dirname, "tests/stubs/server-only.ts") },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/emulator/**/*.test.ts", "tests/rules/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
