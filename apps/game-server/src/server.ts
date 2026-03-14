import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import cors from "cors";
import express from "express";
import type { Request, Response } from "express";
import http from "node:http";

import { shutdownPersistence } from "./persistence/persistedGameRepository.js";
import { HexaforgeGatewayRoom } from "./rooms/HexaforgeGatewayRoom.js";
import { HexaforgeMatchRoom } from "./rooms/HexaforgeMatchRoom.js";
import { GATEWAY_ROOM_NAME, MATCH_ROOM_NAME } from "./rooms/roomNames.js";
import { clearRoomRegistry, listRoomCodes } from "./rooms/roomRegistry.js";
import { logError, logInfo } from "./utils/logger.js";

export interface CreateGameServerOptions {
  port: number;
}

export interface RunningGameServer {
  app: express.Express;
  server: http.Server;
  gameServer: Server;
  port: number;
  stop: () => Promise<void>;
}

export async function createGameServer(options: CreateGameServerOptions): Promise<RunningGameServer> {
  clearRoomRegistry();

  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_request: Request, response: Response) => {
    response.status(200).json({
      ok: true,
      service: "game-server",
      port: options.port,
      timestamp: new Date().toISOString()
    });
  });

  app.get("/debug/rooms", (_request: Request, response: Response) => {
    response.status(200).json({
      roomCodes: listRoomCodes()
    });
  });

  const server = http.createServer(app);
  const gameServer = new Server({
    transport: new WebSocketTransport({ server })
  });

  gameServer.define(GATEWAY_ROOM_NAME, HexaforgeGatewayRoom);
  gameServer.define(MATCH_ROOM_NAME, HexaforgeMatchRoom);

  const port = await new Promise<number>((resolve, reject) => {
    server.listen(options.port, () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Could not resolve listening address"));
        return;
      }

      resolve(address.port);
    });
  });

  logInfo("game-server", "listening", {
    port,
    gatewayRoom: GATEWAY_ROOM_NAME,
    matchRoom: MATCH_ROOM_NAME
  });

  let isStopping = false;

  const stop = async (): Promise<void> => {
    if (isStopping) {
      return;
    }

    isStopping = true;

    try {
      await gameServer.gracefullyShutdown();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (
        !message.includes("process.exit unexpectedly called") &&
        !message.includes("already_shutting_down")
      ) {
        logError("game-server", "error during graceful shutdown", {
          error: message
        });
      }
    }

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    await shutdownPersistence();
    clearRoomRegistry();
  };

  return {
    app,
    server,
    gameServer,
    port,
    stop
  };
}
