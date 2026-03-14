import { mergeConfig } from "vitest/config";

import baseConfig from "../config/vitest/node";

export default mergeConfig(baseConfig, {
  test: {
    include: ["src/**/*.test.ts"]
  }
});
