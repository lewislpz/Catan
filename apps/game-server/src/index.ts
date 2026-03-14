import { pathToFileURL } from "node:url";

import { env } from "./env.js";
import { createGameServer } from "./server.js";
import { logError, logInfo } from "./utils/logger.js";

async function main(): Promise<void> {
  const runningServer = await createGameServer({
    port: env.GAME_SERVER_PORT
  });

  let isShuttingDown = false;

  const shutdown = async (): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logInfo("game-server", "shutting down", {
      port: runningServer.port
    });

    await runningServer.stop();
  };

  process.on("SIGINT", () => {
    void shutdown();
  });

  process.on("SIGTERM", () => {
    void shutdown();
  });
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";

if (import.meta.url === entryUrl) {
  void main().catch((error) => {
    logError("game-server", "fatal startup error", {
      error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  });
}
