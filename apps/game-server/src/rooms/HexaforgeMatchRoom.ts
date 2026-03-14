import { Room, type Client } from "@colyseus/core";
import {
  applyGameAction,
  createGame,
  GameRuleError,
  isGameRuleError,
  type EngineState
} from "@hexaforge/game-engine";
import {
  asGameId,
  asPlayerId,
  asRoomCode,
  type BankTradeRequest,
  type BaseClientRequest,
  type BuildRoadRequest,
  type BuildSettlementRequest,
  type GameAction,
  type LobbyState,
  type MoveRobberRequest,
  type Player,
  type ResourceType,
  type RoomState,
  type SetReadyRequest,
  type UpgradeCityRequest
} from "@hexaforge/shared";
import { randomUUID } from "node:crypto";

import { unregisterRoomCode } from "./roomRegistry.js";
import { saveRoomSnapshot } from "../persistence/persistedGameRepository.js";
import { logError, logInfo } from "../utils/logger.js";
import { generateRoomCode } from "../utils/roomCode.js";

interface MatchRoomOptions {
  roomCode?: string;
  maxPlayers?: number;
}

class PayloadValidationError extends Error {
  readonly code = "INVALID_PAYLOAD";

  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "PayloadValidationError";
    this.details = details;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function toDomainError(error: unknown): {
  code: string;
  message: string;
  details?: Record<string, unknown>;
} {
  if (isGameRuleError(error)) {
    return {
      code: error.code,
      message: error.message,
      details: error.details
    };
  }

  if (error instanceof PayloadValidationError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details
    };
  }

  if (error instanceof Error) {
    return {
      code: "UNEXPECTED_ERROR",
      message: error.message
    };
  }

  return {
    code: "UNEXPECTED_ERROR",
    message: "Unknown error"
  };
}

const RESOURCE_TYPES: ReadonlyArray<ResourceType> = ["timber", "clay", "fiber", "grain", "alloy"];
const MAX_TRACKED_LOBBY_REQUEST_IDS = 1024;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isResourceType(value: unknown): value is ResourceType {
  return typeof value === "string" && RESOURCE_TYPES.includes(value as ResourceType);
}

export class HexaforgeMatchRoom extends Room {
  override maxClients = 4;

  private roomState!: RoomState;

  private engineState: EngineState | null = null;

  private processedLobbyRequestIds = new Set<string>();

  private processedLobbyRequestIdOrder: string[] = [];

  override onCreate(options: MatchRoomOptions): void {
    const roomCode = asRoomCode((options.roomCode ?? generateRoomCode()).toUpperCase());
    const gameId = asGameId(`game_${randomUUID()}`);

    this.maxClients = options.maxPlayers ?? 4;

    const lobby: LobbyState = {
      gameId,
      roomCode,
      status: "open",
      maxPlayers: this.maxClients,
      hostPlayerId: null,
      players: [],
      readyPlayerIds: []
    };

    this.roomState = {
      gameId,
      roomCode,
      lobby,
      game: null,
      revision: 1
    };

    this.setMetadata({
      roomCode,
      gameId
    });

    this.onMessage("request_sync", (client, payload: Partial<BaseClientRequest> | undefined) => {
      this.handleRequestSync(client, payload);
    });

    this.onMessage("set_ready", (client, payload: SetReadyRequest) => {
      this.handleSetReady(client, payload);
    });

    this.onMessage("start_game", (client, payload: BaseClientRequest) => {
      this.handleStartGame(client, payload);
    });

    this.onMessage("roll_dice", (client, payload: BaseClientRequest) => {
      this.handleGameAction(client, payload, "TURN_ROLL_DICE");
    });

    this.onMessage("build_road", (client, payload: BuildRoadRequest) => {
      this.handleGameAction(client, payload, "BUILD_TRAIL");
    });

    this.onMessage("build_settlement", (client, payload: BuildSettlementRequest) => {
      this.handleGameAction(client, payload, "BUILD_OUTPOST");
    });

    this.onMessage("upgrade_city", (client, payload: UpgradeCityRequest) => {
      this.handleGameAction(client, payload, "UPGRADE_STRONGHOLD");
    });

    this.onMessage("move_robber", (client, payload: MoveRobberRequest) => {
      this.handleGameAction(client, payload, "RAIDER_MOVE");
    });

    this.onMessage("bank_trade", (client, payload: BankTradeRequest) => {
      this.handleGameAction(client, payload, "TRADE_BANK");
    });

    this.onMessage("end_turn", (client, payload: BaseClientRequest) => {
      this.handleGameAction(client, payload, "TURN_END");
    });

    logInfo("match-room", "created", {
      roomId: this.roomId,
      roomCode,
      gameId
    });
  }

  override onJoin(client: Client, options?: { display_name?: string }): void {
    if (this.roomState.lobby.status !== "open") {
      throw new GameRuleError("INVALID_PHASE", "Cannot join a match that has already started");
    }

    const player: Player = {
      id: asPlayerId(client.sessionId),
      displayName: normalizeDisplayName(options?.display_name, this.roomState.lobby.players.length + 1),
      color: pickColor(this.roomState.lobby.players.length),
      isHost: this.roomState.lobby.players.length === 0,
      isConnected: true,
      joinedAtIso: nowIso()
    };

    this.roomState.lobby.players.push(player);

    if (!this.roomState.lobby.hostPlayerId) {
      this.roomState.lobby.hostPlayerId = player.id;
    }

    this.bumpRevision();
    this.broadcastStateSync();
    void this.persistSnapshot();

    logInfo("match-room", "player joined", {
      roomId: this.roomId,
      roomCode: this.roomState.roomCode,
      playerId: player.id,
      playerName: player.displayName
    });
  }

  override onLeave(client: Client): void {
    const playerId = asPlayerId(client.sessionId);
    const existingPlayer = this.roomState.lobby.players.find((player) => player.id === playerId);
    const wasActivePlayer = this.roomState.game?.turn.activePlayerId === playerId;

    if (!existingPlayer) {
      return;
    }

    if (this.roomState.lobby.status === "open") {
      this.roomState.lobby.players = this.roomState.lobby.players.filter((player) => player.id !== playerId);
      this.roomState.lobby.readyPlayerIds = this.roomState.lobby.readyPlayerIds.filter(
        (readyPlayerId) => readyPlayerId !== playerId
      );
    } else {
      existingPlayer.isConnected = false;
      this.roomState.lobby.readyPlayerIds = this.roomState.lobby.readyPlayerIds.filter(
        (readyPlayerId) => readyPlayerId !== playerId
      );
    }

    this.ensureHostAssigned();

    if (this.roomState.lobby.status === "in_game" && wasActivePlayer) {
      this.advanceTurnAfterDisconnect(playerId);
    }

    this.bumpRevision();
    this.broadcastStateSync();
    void this.persistSnapshot();

    logInfo("match-room", "player left", {
      roomId: this.roomId,
      roomCode: this.roomState.roomCode,
      playerId
    });
  }

  override onDispose(): void {
    unregisterRoomCode(this.roomState.roomCode);
    this.processedLobbyRequestIds.clear();
    this.processedLobbyRequestIdOrder = [];

    logInfo("match-room", "disposed", {
      roomId: this.roomId,
      roomCode: this.roomState.roomCode
    });
  }

  private handleRequestSync(client: Client, payload?: Partial<BaseClientRequest>): void {
    if (payload?.request_id) {
      this.sendCommandOk(client, payload.request_id, []);
    }

    this.sendStateSync(client);
  }

  private handleSetReady(client: Client, payload: SetReadyRequest): void {
    const requestId = payload?.request_id;

    if (!requestId) {
      this.sendDomainError(client, "unknown", "INVALID_PAYLOAD", "request_id is required");
      return;
    }

    if (this.processedLobbyRequestIds.has(requestId)) {
      this.sendCommandOk(client, requestId, []);
      return;
    }

    if (typeof payload.ready !== "boolean") {
      this.sendDomainError(client, requestId, "INVALID_PAYLOAD", "ready must be a boolean");
      return;
    }

    if (this.roomState.lobby.status !== "open") {
      this.sendDomainError(client, requestId, "INVALID_PHASE", "Lobby is closed");
      return;
    }

    const playerId = asPlayerId(client.sessionId);
    const exists = this.roomState.lobby.players.some((player) => player.id === playerId);

    if (!exists) {
      this.sendDomainError(client, requestId, "PLAYER_NOT_FOUND", "Player is not in lobby");
      return;
    }

    const currentlyReady = this.roomState.lobby.readyPlayerIds.includes(playerId);

    if (payload.ready && !currentlyReady) {
      this.roomState.lobby.readyPlayerIds.push(playerId);
    }

    if (!payload.ready && currentlyReady) {
      this.roomState.lobby.readyPlayerIds = this.roomState.lobby.readyPlayerIds.filter(
        (readyPlayerId) => readyPlayerId !== playerId
      );
    }

    this.rememberLobbyRequestId(requestId);

    this.bumpRevision();
    this.broadcastStateSync();
    void this.persistSnapshot();

    this.sendCommandOk(client, requestId, []);

    logInfo("match-room", "player readiness updated", {
      roomId: this.roomId,
      playerId,
      ready: payload.ready
    });
  }

  private handleStartGame(client: Client, payload: BaseClientRequest): void {
    const requestId = payload?.request_id;

    if (!requestId) {
      this.sendDomainError(client, "unknown", "INVALID_PAYLOAD", "request_id is required");
      return;
    }

    if (this.processedLobbyRequestIds.has(requestId)) {
      this.sendCommandOk(client, requestId, []);
      return;
    }

    if (this.roomState.lobby.status !== "open") {
      this.sendDomainError(client, requestId, "INVALID_PHASE", "Game has already started");
      return;
    }

    const playerId = asPlayerId(client.sessionId);

    if (playerId !== this.roomState.lobby.hostPlayerId) {
      this.sendDomainError(client, requestId, "NOT_HOST", "Only host can start the game");
      return;
    }

    const playerCount = this.roomState.lobby.players.length;

    if (playerCount !== 3 && playerCount !== 4) {
      this.sendDomainError(client, requestId, "INVALID_PLAYER_COUNT", "Game can only start with 3 or 4 players");
      return;
    }

    const allConnected = this.roomState.lobby.players.every((player) => player.isConnected);

    if (!allConnected) {
      this.sendDomainError(client, requestId, "PLAYER_DISCONNECTED", "All players must be connected");
      return;
    }

    const allReady = this.roomState.lobby.players.every((player) =>
      this.roomState.lobby.readyPlayerIds.includes(player.id)
    );

    if (!allReady) {
      this.sendDomainError(client, requestId, "NOT_ALL_READY", "All players must be ready");
      return;
    }

    this.engineState = createGame({
      gameId: this.roomState.gameId,
      players: this.roomState.lobby.players,
      seed: `${this.roomState.gameId}:${this.roomState.roomCode}`
    });

    this.roomState.game = this.engineState.game;
    this.roomState.lobby.status = "in_game";
    this.rememberLobbyRequestId(requestId);

    this.lock();
    this.bumpRevision();
    this.broadcastStateSync();
    void this.persistSnapshot();

    this.sendCommandOk(client, requestId, [
      {
        type: "TURN_CHANGED",
        turn: this.engineState.game.turn
      }
    ]);

    logInfo("match-room", "game started", {
      roomId: this.roomId,
      roomCode: this.roomState.roomCode,
      gameId: this.roomState.gameId,
      playerCount
    });
  }

  private handleGameAction(
    client: Client,
    payload: BaseClientRequest | BuildRoadRequest | BuildSettlementRequest | UpgradeCityRequest | MoveRobberRequest | BankTradeRequest,
    actionType: GameAction["type"]
  ): void {
    const requestId = payload?.request_id;

    if (!requestId) {
      this.sendDomainError(client, "unknown", "INVALID_PAYLOAD", "request_id is required");
      return;
    }

    if (this.roomState.lobby.status !== "in_game" || !this.engineState) {
      this.sendDomainError(client, requestId, "INVALID_PHASE", "Game is not in progress");
      return;
    }

    const playerId = asPlayerId(client.sessionId);
    const actingPlayer = this.roomState.lobby.players.find((player) => player.id === playerId);

    if (!actingPlayer) {
      this.sendDomainError(client, requestId, "PLAYER_NOT_FOUND", "Player is not part of this room");
      return;
    }

    if (!actingPlayer.isConnected) {
      this.sendDomainError(client, requestId, "PLAYER_DISCONNECTED", "Disconnected players cannot act");
      return;
    }

    let action: GameAction;

    try {
      action = toGameAction(actionType, playerId, payload);
    } catch (error) {
      const domainError = toDomainError(error);
      this.sendDomainError(client, requestId, domainError.code, domainError.message, domainError.details);
      return;
    }

    try {
      const result = applyGameAction(this.engineState, action, {
        nowIso: nowIso()
      });

      this.engineState = result.state;
      this.roomState.game = result.state.game;

      if (result.state.game.winnerPlayerId) {
        this.roomState.lobby.status = "finished";
      }

      this.bumpRevision();
      this.broadcastStateSync();
      void this.persistSnapshot();

      this.sendCommandOk(client, requestId, result.events);

      logInfo("match-room", "action applied", {
        roomId: this.roomId,
        roomCode: this.roomState.roomCode,
        playerId,
        actionType,
        requestId
      });
    } catch (error) {
      const domainError = toDomainError(error);
      this.sendDomainError(client, requestId, domainError.code, domainError.message, domainError.details);

      logError("match-room", "action rejected", {
        roomId: this.roomId,
        roomCode: this.roomState.roomCode,
        playerId,
        actionType,
        requestId,
        code: domainError.code,
        message: domainError.message
      });
    }
  }

  private sendCommandOk(client: Client, requestId: string, events: unknown[]): void {
    client.send("command_ok", {
      request_id: requestId,
      events
    });
  }

  private sendDomainError(
    client: Client,
    requestId: string,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ): void {
    client.send("domain_error", {
      request_id: requestId,
      code,
      message,
      details
    });
  }

  private rememberLobbyRequestId(requestId: string): void {
    if (this.processedLobbyRequestIds.has(requestId)) {
      return;
    }

    this.processedLobbyRequestIds.add(requestId);
    this.processedLobbyRequestIdOrder.push(requestId);

    if (this.processedLobbyRequestIdOrder.length <= MAX_TRACKED_LOBBY_REQUEST_IDS) {
      return;
    }

    const oldestRequestId = this.processedLobbyRequestIdOrder.shift();

    if (oldestRequestId) {
      this.processedLobbyRequestIds.delete(oldestRequestId);
    }
  }

  private buildStateForClient(client: Client): RoomState {
    const clone = structuredClone(this.roomState);
    const playerId = asPlayerId(client.sessionId);

    if (!clone.game) {
      return clone;
    }

    const ownPrivateState = clone.game.privatePlayerStates[playerId];

    clone.game.privatePlayerStates = ownPrivateState
      ? {
          [playerId]: ownPrivateState
        }
      : {};

    return clone;
  }

  private sendStateSync(client: Client): void {
    client.send("state_sync", {
      state: this.buildStateForClient(client)
    });
  }

  private broadcastStateSync(): void {
    for (const client of this.clients) {
      this.sendStateSync(client);
    }
  }

  private bumpRevision(): void {
    this.roomState.revision += 1;
  }

  private ensureHostAssigned(): void {
    if (this.roomState.lobby.players.length === 0) {
      this.roomState.lobby.hostPlayerId = null;
      return;
    }

    const currentHostId = this.roomState.lobby.hostPlayerId;
    const currentHostExists = this.roomState.lobby.players.some((player) => player.id === currentHostId);

    if (!currentHostExists) {
      const nextHost = this.roomState.lobby.players[0];
      this.roomState.lobby.hostPlayerId = nextHost?.id ?? null;
    }

    this.roomState.lobby.players = this.roomState.lobby.players.map((player) => ({
      ...player,
      isHost: player.id === this.roomState.lobby.hostPlayerId
    }));
  }

  private advanceTurnAfterDisconnect(disconnectedPlayerId: GameAction["playerId"]): void {
    if (!this.roomState.game) {
      return;
    }

    if (this.roomState.game.turn.phase === "finished") {
      return;
    }

    const connectedPlayerIds = this.roomState.lobby.players
      .filter((player) => player.isConnected)
      .map((player) => player.id);

    if (connectedPlayerIds.length === 0) {
      this.roomState.lobby.status = "finished";
      return;
    }

    const disconnectedPlayerIndex = this.roomState.lobby.players.findIndex(
      (player) => player.id === disconnectedPlayerId
    );

    if (disconnectedPlayerIndex < 0) {
      return;
    }

    for (let offset = 1; offset <= this.roomState.lobby.players.length; offset += 1) {
      const candidateIndex = (disconnectedPlayerIndex + offset) % this.roomState.lobby.players.length;
      const candidatePlayer = this.roomState.lobby.players[candidateIndex];

      if (!candidatePlayer || !candidatePlayer.isConnected) {
        continue;
      }

      this.roomState.game.turn.turnNumber += 1;
      this.roomState.game.turn.activePlayerId = candidatePlayer.id;
      this.roomState.game.turn.phase = "roll";
      this.roomState.game.turn.diceRoll = null;
      this.roomState.game.turn.hasRolled = false;
      this.roomState.game.robber.mustDiscardPlayerIds = this.roomState.game.robber.mustDiscardPlayerIds.filter(
        (playerId) => playerId !== disconnectedPlayerId
      );
      this.engineState = {
        game: this.roomState.game,
        processedRequestIds: this.engineState?.processedRequestIds ?? []
      };

      logInfo("match-room", "active player disconnected, advanced turn", {
        roomId: this.roomId,
        roomCode: this.roomState.roomCode,
        disconnectedPlayerId,
        nextActivePlayerId: candidatePlayer.id
      });
      return;
    }
  }

  private async persistSnapshot(): Promise<void> {
    try {
      await saveRoomSnapshot(structuredClone(this.roomState));
    } catch (error) {
      logError("match-room", "snapshot persistence failed", {
        roomId: this.roomId,
        roomCode: this.roomState.roomCode,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

function toGameAction(
  actionType: GameAction["type"],
  playerId: GameAction["playerId"],
  payload: BaseClientRequest | BuildRoadRequest | BuildSettlementRequest | UpgradeCityRequest | MoveRobberRequest | BankTradeRequest
): GameAction {
  if (!isNonEmptyString(payload?.request_id)) {
    throw new PayloadValidationError("request_id is required");
  }

  switch (actionType) {
    case "TURN_ROLL_DICE":
      return {
        type: "TURN_ROLL_DICE",
        requestId: payload.request_id,
        playerId
      };
    case "BUILD_TRAIL": {
      const typedPayload = payload as BuildRoadRequest;

      if (!isNonEmptyString(typedPayload.edge_id)) {
        throw new PayloadValidationError("edge_id is required");
      }

      return {
        type: "BUILD_TRAIL",
        requestId: payload.request_id,
        playerId,
        edgeId: typedPayload.edge_id
      };
    }
    case "BUILD_OUTPOST": {
      const typedPayload = payload as BuildSettlementRequest;

      if (!isNonEmptyString(typedPayload.vertex_id)) {
        throw new PayloadValidationError("vertex_id is required");
      }

      return {
        type: "BUILD_OUTPOST",
        requestId: payload.request_id,
        playerId,
        vertexId: typedPayload.vertex_id
      };
    }
    case "UPGRADE_STRONGHOLD": {
      const typedPayload = payload as UpgradeCityRequest;

      if (!isNonEmptyString(typedPayload.vertex_id)) {
        throw new PayloadValidationError("vertex_id is required");
      }

      return {
        type: "UPGRADE_STRONGHOLD",
        requestId: payload.request_id,
        playerId,
        vertexId: typedPayload.vertex_id
      };
    }
    case "RAIDER_MOVE": {
      const typedPayload = payload as MoveRobberRequest;

      if (!isNonEmptyString(typedPayload.tile_id)) {
        throw new PayloadValidationError("tile_id is required");
      }

      return {
        type: "RAIDER_MOVE",
        requestId: payload.request_id,
        playerId,
        tileId: typedPayload.tile_id
      };
    }
    case "TRADE_BANK": {
      const typedPayload = payload as BankTradeRequest;

      if (
        !typedPayload.give ||
        !typedPayload.receive ||
        !isResourceType(typedPayload.give.resource) ||
        !isResourceType(typedPayload.receive.resource) ||
        !isPositiveInteger(typedPayload.give.amount) ||
        !isPositiveInteger(typedPayload.receive.amount)
      ) {
        throw new PayloadValidationError("bank_trade payload is invalid");
      }

      return {
        type: "TRADE_BANK",
        requestId: payload.request_id,
        playerId,
        give: {
          resource: typedPayload.give.resource,
          amount: typedPayload.give.amount
        },
        receive: {
          resource: typedPayload.receive.resource,
          amount: typedPayload.receive.amount
        }
      };
    }
    case "TURN_END":
      return {
        type: "TURN_END",
        requestId: payload.request_id,
        playerId
      };
    case "RAIDER_STEAL":
      throw new GameRuleError("ACTION_NOT_SUPPORTED", "RAIDER_STEAL is not exposed in phase 3 messages");
  }
}

function normalizeDisplayName(displayName: string | undefined, playerNumber: number): string {
  const trimmed = displayName?.trim();

  if (trimmed) {
    return trimmed.slice(0, 24);
  }

  return `Player-${playerNumber}`;
}

function pickColor(index: number): string {
  const palette = ["amber", "teal", "slate", "rose"];
  return palette[index % palette.length] as string;
}
