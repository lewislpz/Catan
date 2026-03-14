import { mergeConfig } from "vitest/config";

import baseConfig from "../../packages/config/vitest/react";

export default mergeConfig(baseConfig, {
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test/setup.ts"]
  }
});
