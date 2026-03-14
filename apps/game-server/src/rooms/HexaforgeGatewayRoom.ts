import { matchMaker, Room, type Client } from "@colyseus/core";
import type {
  BaseClientRequest,
  CreateRoomRequest,
  JoinRoomRequest
} from "@hexaforge/shared";

import { MATCH_ROOM_NAME } from "./roomNames.js";
import {
  clearRoomRegistry,
  getRoomIdByCode,
  listRoomCodes,
  registerRoomCode
} from "./roomRegistry.js";
import { logError, logInfo } from "../utils/logger.js";
import { generateRoomCode } from "../utils/roomCode.js";

export class HexaforgeGatewayRoom extends Room {
  override maxClients = 500;

  override onCreate(): void {
    this.onMessage("create_room", (client, payload: CreateRoomRequest) => {
      void this.handleCreateRoom(client, payload);
    });

    this.onMessage("join_room", (client, payload: JoinRoomRequest) => {
      void this.handleJoinRoom(client, payload);
    });

    this.onMessage("request_sync", (client, payload: BaseClientRequest | undefined) => {
      this.handleRequestSync(client, payload);
    });

    logInfo("gateway-room", "created", {
      roomId: this.roomId
    });
  }

  override onDispose(): void {
    clearRoomRegistry();

    logInfo("gateway-room", "disposed", {
      roomId: this.roomId
    });
  }

  private async handleCreateRoom(client: Client, payload: CreateRoomRequest): Promise<void> {
    const requestId = payload?.request_id;

    if (!requestId) {
      this.sendDomainError(client, "unknown", "INVALID_PAYLOAD", "request_id is required");
      return;
    }

    const roomCode = await this.generateUniqueRoomCode();

    try {
      const room = await matchMaker.createRoom(MATCH_ROOM_NAME, {
        roomCode,
        maxPlayers: 4
      });

      registerRoomCode(roomCode, room.roomId);

      client.send("create_room_result", {
        request_id: requestId,
        room_id: room.roomId,
        room_code: roomCode,
        display_name: payload?.display_name?.trim() || null
      });

      logInfo("gateway-room", "room created", {
        requestId,
        roomCode,
        roomId: room.roomId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create room";

      this.sendDomainError(client, requestId, "ROOM_CREATE_FAILED", message);
      logError("gateway-room", "create_room failed", {
        requestId,
        roomCode,
        message
      });
    }
  }

  private async handleJoinRoom(client: Client, payload: JoinRoomRequest): Promise<void> {
    const requestId = payload?.request_id;
    const roomCode = payload?.room_code?.trim().toUpperCase();

    if (!requestId) {
      this.sendDomainError(client, "unknown", "INVALID_PAYLOAD", "request_id is required");
      return;
    }

    if (!roomCode) {
      this.sendDomainError(client, requestId, "INVALID_PAYLOAD", "room_code is required");
      return;
    }

    let roomId = getRoomIdByCode(roomCode);

    if (!roomId) {
      const listing = await this.findRoomByCode(roomCode);

      if (listing) {
        roomId = listing.roomId;
        registerRoomCode(roomCode, roomId);
      }
    }

    if (!roomId) {
      this.sendDomainError(client, requestId, "ROOM_NOT_FOUND", "No active room with that code");
      return;
    }

    client.send("join_room_result", {
      request_id: requestId,
      room_id: roomId,
      room_code: roomCode,
      display_name: payload?.display_name?.trim() || null
    });

    logInfo("gateway-room", "room joined", {
      requestId,
      roomCode,
      roomId
    });
  }

  private handleRequestSync(client: Client, payload?: BaseClientRequest): void {
    client.send("gateway_sync", {
      request_id: payload?.request_id ?? null,
      available_room_codes: listRoomCodes()
    });
  }

  private sendDomainError(client: Client, requestId: string, code: string, message: string): void {
    client.send("domain_error", {
      request_id: requestId,
      code,
      message
    });
  }

  private async generateUniqueRoomCode(): Promise<string> {
    let attempts = 0;

    while (attempts < 20) {
      const candidate = generateRoomCode().toUpperCase();
      const knownRoomId = getRoomIdByCode(candidate);

      if (!knownRoomId) {
        const existing = await this.findRoomByCode(candidate);

        if (!existing) {
          return candidate;
        }
      }

      attempts += 1;
    }

    throw new Error("Failed to generate a unique room code");
  }

  private async findRoomByCode(roomCode: string): Promise<{ roomId: string } | null> {
    const rooms = await matchMaker.query({
      name: MATCH_ROOM_NAME
    });

    const found = rooms.find((room) => room.metadata?.roomCode === roomCode);

    return found ? { roomId: found.roomId } : null;
  }
}
