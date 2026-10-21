import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "netlify/**/*.test.ts", "api/**/*.test.ts"],
    environment: "node",
    // Run test files one worker at a time: a couple of player tests assert
    // wall-clock beat phase and must not be preempted by heavy scrypt work
    // (admin auth) running concurrently in another worker.
    fileParallelism: false,
  },
});