import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    coverage: {
      enabled: false,
      reporter: ["text", "html"],
      provider: "v8"
    }
  }
});
