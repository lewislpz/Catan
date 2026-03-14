import {
  createRequestId,
  ROOM_NAMES,
  type BaseClientRequest,
  type CommandOkMessage,
  type CreateOrJoinRoomResult,
  type DomainErrorMessage,
  type MatchClientMessageType,
  type ResourceType,
  type StateSyncMessage
} from "@hexaforge/shared";
import { Client, type Room } from "colyseus.js";

import { publicEnv } from "./env";

const DEFAULT_TIMEOUT_MS = 6_000;

type RoomLike = Room<Record<string, never>>;

type MessageCleanup = () => void;

export class HexaforgeClient {
  private readonly client = new Client(publicEnv.gameServerUrl);

  private gatewayRoom: RoomLike | null = null;

  private matchRoom: RoomLike | null = null;

  async connectGateway(): Promise<void> {
    if (this.gatewayRoom) {
      return;
    }

    this.gatewayRoom = (await this.client.joinOrCreate(ROOM_NAMES.gateway, {})) as RoomLike;
  }

  async createRoom(displayName: string): Promise<CreateOrJoinRoomResult> {
    await this.connectGateway();

    const payload = {
      request_id: createRequestId("create"),
      display_name: displayName.trim() || undefined
    };

    const response = await this.sendGatewayRequest<CreateOrJoinRoomResult>(
      "create_room",
      payload,
      "create_room_result"
    );

    return response;
  }

  async joinRoom(roomCode: string, displayName: string): Promise<CreateOrJoinRoomResult> {
    await this.connectGateway();

    const payload = {
      request_id: createRequestId("join"),
      room_code: roomCode.trim().toUpperCase(),
      display_name: displayName.trim() || undefined
    };

    const response = await this.sendGatewayRequest<CreateOrJoinRoomResult>(
      "join_room",
      payload,
      "join_room_result"
    );

    return response;
  }

  async joinMatchRoom(roomId: string, displayName: string): Promise<void> {
    if (this.matchRoom) {
      await this.matchRoom.leave();
      this.matchRoom = null;
    }

    this.matchRoom = (await this.client.joinById(roomId, {
      display_name: displayName.trim() || undefined
    })) as RoomLike;
  }

  getSessionPlayerId(): string | null {
    return this.matchRoom?.sessionId ?? null;
  }

  onStateSync(listener: (state: StateSyncMessage["state"]) => void): MessageCleanup {
    const room = this.requireMatchRoom();

    return this.attachMessageListener(room, "state_sync", (payload: StateSyncMessage) => {
      listener(payload.state);
    });
  }

  onCommandOk(listener: (payload: CommandOkMessage) => void): MessageCleanup {
    const room = this.requireMatchRoom();

    return this.attachMessageListener(room, "command_ok", (payload: CommandOkMessage) => {
      listener(payload);
    });
  }

  onDomainError(listener: (payload: DomainErrorMessage) => void): MessageCleanup {
    const room = this.requireMatchRoom();

    return this.attachMessageListener(room, "domain_error", (payload: DomainErrorMessage) => {
      listener(payload);
    });
  }

  requestSync(): void {
    this.sendMatch("request_sync", {
      request_id: createRequestId("sync")
    });
  }

  setReady(ready: boolean): string {
    const requestId = createRequestId("ready");

    this.sendMatch("set_ready", {
      request_id: requestId,
      ready
    });

    return requestId;
  }

  startGame(): string {
    return this.sendSimpleCommand("start_game", "start");
  }

  rollDice(): string {
    return this.sendSimpleCommand("roll_dice", "roll");
  }

  buildRoad(edgeId: string): string {
    const requestId = createRequestId("road");

    this.sendMatch("build_road", {
      request_id: requestId,
      edge_id: edgeId
    });

    return requestId;
  }

  buildSettlement(vertexId: string): string {
    const requestId = createRequestId("settlement");

    this.sendMatch("build_settlement", {
      request_id: requestId,
      vertex_id: vertexId
    });

    return requestId;
  }

  upgradeCity(vertexId: string): string {
    const requestId = createRequestId("city");

    this.sendMatch("upgrade_city", {
      request_id: requestId,
      vertex_id: vertexId
    });

    return requestId;
  }

  moveRobber(tileId: string): string {
    const requestId = createRequestId("robber");

    this.sendMatch("move_robber", {
      request_id: requestId,
      tile_id: tileId
    });

    return requestId;
  }

  bankTrade(giveResource: ResourceType, receiveResource: ResourceType): string {
    const requestId = createRequestId("trade");

    this.sendMatch("bank_trade", {
      request_id: requestId,
      give: {
        resource: giveResource,
        amount: 4
      },
      receive: {
        resource: receiveResource,
        amount: 1
      }
    });

    return requestId;
  }

  endTurn(): string {
    return this.sendSimpleCommand("end_turn", "end");
  }

  async disconnect(): Promise<void> {
    if (this.matchRoom) {
      await this.matchRoom.leave();
      this.matchRoom = null;
    }

    if (this.gatewayRoom) {
      await this.gatewayRoom.leave();
      this.gatewayRoom = null;
    }
  }

  private requireGatewayRoom(): RoomLike {
    if (!this.gatewayRoom) {
      throw new Error("Gateway room is not connected");
    }

    return this.gatewayRoom;
  }

  private requireMatchRoom(): RoomLike {
    if (!this.matchRoom) {
      throw new Error("Match room is not connected");
    }

    return this.matchRoom;
  }

  private sendSimpleCommand(type: MatchClientMessageType, prefix: string): string {
    const requestId = createRequestId(prefix);

    this.sendMatch(type, {
      request_id: requestId
    });

    return requestId;
  }

  private sendMatch(type: MatchClientMessageType | string, payload: Record<string, unknown>): void {
    this.requireMatchRoom().send(type, payload);
  }

  private async sendGatewayRequest<TPayload extends { request_id: string }>(
    messageType: string,
    payload: Record<string, unknown> & BaseClientRequest,
    successType: string
  ): Promise<TPayload> {
    const gateway = this.requireGatewayRoom();

    const responsePromise = new Promise<TPayload>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Gateway request '${messageType}' timed out`));
      }, DEFAULT_TIMEOUT_MS);

      const successUnsubscribe = this.attachMessageListener(gateway, successType, (successPayload: TPayload) => {
        if (successPayload.request_id !== payload.request_id) {
          return;
        }

        cleanup();
        resolve(successPayload);
      });

      const errorUnsubscribe = this.attachMessageListener(
        gateway,
        "domain_error",
        (errorPayload: DomainErrorMessage) => {
          if (errorPayload.request_id !== payload.request_id && errorPayload.request_id !== "unknown") {
            return;
          }

          cleanup();
          reject(new Error(`${errorPayload.code}: ${errorPayload.message}`));
        }
      );

      const cleanup = () => {
        clearTimeout(timeout);
        successUnsubscribe();
        errorUnsubscribe();
      };
    });

    gateway.send(messageType, payload);

    return responsePromise;
  }

  private attachMessageListener<TPayload>(
    room: RoomLike,
    messageType: string,
    handler: (payload: TPayload) => void
  ): MessageCleanup {
    const unsubscribe = room.onMessage(messageType, (payload: TPayload) => {
      handler(payload);
    });

    if (typeof unsubscribe === "function") {
      return unsubscribe;
    }

    return () => {
      // colyseus.js does not always return an unsubscribe function for wildcard listeners
    };
  }
}
