import type { RoomState } from "@hexaforge/shared";
// eslint-disable-next-line import/no-unresolved
import { Client } from "colyseus.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GATEWAY_ROOM_NAME } from "../rooms/roomNames.js";
import { createGameServer, type RunningGameServer } from "../server.js";

interface CreateOrJoinResult {
  request_id: string;
  room_id: string;
  room_code: string;
}

interface CommandOk {
  request_id: string;
  events: unknown[];
}

interface DomainError {
  request_id: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

interface SyncEnvelope {
  state: RoomState;
}

interface ConnectedPlayer {
  client: Client;
  gateway: Awaited<ReturnType<Client["joinOrCreate"]>>;
  match: Awaited<ReturnType<Client["joinById"]>>;
  displayName: string;
}

let runningServer: RunningGameServer;
let wsUrl = "";

async function waitForMessage<TPayload>(
  room: Awaited<ReturnType<Client["joinOrCreate"]>>,
  messageType: string,
  timeoutMs = 4_000
): Promise<TPayload> {
  return new Promise<TPayload>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for message '${messageType}'`));
    }, timeoutMs);

    const unsubscribe = room.onMessage(messageType, (payload: TPayload) => {
      clearTimeout(timeout);
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
      resolve(payload);
    });
  });
}

async function sendAndExpectOk(
  room: Awaited<ReturnType<Client["joinOrCreate"]>>,
  messageType: string,
  payload: Record<string, unknown>
): Promise<CommandOk> {
  const okPromise = waitForMessage<CommandOk>(room, "command_ok");
  const errorPromise = waitForMessage<DomainError>(room, "domain_error");

  room.send(messageType, payload);

  const result = await Promise.race([
    okPromise.then((ok) => ({ type: "ok" as const, ok })),
    errorPromise.then((error) => ({ type: "error" as const, error }))
  ]);

  if (result.type === "error") {
    throw new Error(`Domain error ${result.error.code}: ${result.error.message}`);
  }

  return result.ok;
}

async function sendAndExpectError(
  room: Awaited<ReturnType<Client["joinOrCreate"]>>,
  messageType: string,
  payload: Record<string, unknown>
): Promise<DomainError> {
  const okPromise = waitForMessage<CommandOk>(room, "command_ok");
  const errorPromise = waitForMessage<DomainError>(room, "domain_error");

  room.send(messageType, payload);

  const result = await Promise.race([
    okPromise.then((ok) => ({ type: "ok" as const, ok })),
    errorPromise.then((error) => ({ type: "error" as const, error }))
  ]);

  if (result.type === "ok") {
    throw new Error(`Expected domain_error but command_ok was returned for '${messageType}'`);
  }

  return result.error;
}

async function requestSync(room: Awaited<ReturnType<Client["joinOrCreate"]>>): Promise<RoomState> {
  const syncPromise = waitForMessage<SyncEnvelope>(room, "state_sync");
  room.send("request_sync", {});
  return (await syncPromise).state;
}

async function connectGatewayClient(): Promise<{ client: Client; gateway: Awaited<ReturnType<Client["joinOrCreate"]>> }> {
  const client = new Client(wsUrl);
  const gateway = await client.joinOrCreate(GATEWAY_ROOM_NAME, {});
  gateway.onMessage("*", () => {});

  return {
    client,
    gateway
  };
}

async function createRoomAndJoinAsHost(displayName: string): Promise<{
  roomCode: string;
  roomId: string;
  host: ConnectedPlayer;
}> {
  const { client, gateway } = await connectGatewayClient();

  const createResultPromise = waitForMessage<CreateOrJoinResult>(gateway, "create_room_result");

  gateway.send("create_room", {
    request_id: "create-room-1",
    display_name: displayName
  });

  const createResult = await createResultPromise;

  const match = await client.joinById(createResult.room_id, {
    display_name: displayName
  });
  match.onMessage("*", () => {});

  return {
    roomCode: createResult.room_code,
    roomId: createResult.room_id,
    host: {
      client,
      gateway,
      match,
      displayName
    }
  };
}

async function joinRoomByCode(roomCode: string, displayName: string): Promise<ConnectedPlayer> {
  const { client, gateway } = await connectGatewayClient();

  const joinResultPromise = waitForMessage<CreateOrJoinResult>(gateway, "join_room_result");

  gateway.send("join_room", {
    request_id: `join-${displayName}`,
    room_code: roomCode,
    display_name: displayName
  });

  const joinResult = await joinResultPromise;

  const match = await client.joinById(joinResult.room_id, {
    display_name: displayName
  });
  match.onMessage("*", () => {});

  return {
    client,
    gateway,
    match,
    displayName
  };
}

async function closePlayerConnection(player: ConnectedPlayer): Promise<void> {
  await player.match.leave();
  await player.gateway.leave();
}

async function closePlayers(players: ConnectedPlayer[]): Promise<void> {
  for (const player of players) {
    try {
      await closePlayerConnection(player);
    } catch {
      // player may already be disconnected in specific tests
    }
  }
}

async function createStartedThreePlayerMatch(testSuffix: string): Promise<{
  host: ConnectedPlayer;
  guest1: ConnectedPlayer;
  guest2: ConnectedPlayer;
  roomCode: string;
}> {
  const created = await createRoomAndJoinAsHost(`Host-${testSuffix}`);
  const guest1 = await joinRoomByCode(created.roomCode, `Guest-${testSuffix}-1`);
  const guest2 = await joinRoomByCode(created.roomCode, `Guest-${testSuffix}-2`);

  await sendAndExpectOk(created.host.match, "set_ready", {
    request_id: `ready-${testSuffix}-h`,
    ready: true
  });
  await sendAndExpectOk(guest1.match, "set_ready", {
    request_id: `ready-${testSuffix}-g1`,
    ready: true
  });
  await sendAndExpectOk(guest2.match, "set_ready", {
    request_id: `ready-${testSuffix}-g2`,
    ready: true
  });
  await sendAndExpectOk(created.host.match, "start_game", {
    request_id: `start-${testSuffix}`
  });

  return {
    host: created.host,
    guest1,
    guest2,
    roomCode: created.roomCode
  };
}

describe("game-server multiplayer integration", () => {
  beforeAll(async () => {
    process.env.DISABLE_PERSISTENCE = "true";

    runningServer = await createGameServer({
      port: 0
    });

    wsUrl = `ws://127.0.0.1:${runningServer.port}`;
  });

  afterAll(async () => {
    await runningServer.stop();
  });

  it("creates a room and joins as host", async () => {
    const created = await createRoomAndJoinAsHost("Host-A");

    try {
      expect(created.roomCode).toHaveLength(6);
      expect(created.roomId.length).toBeGreaterThan(0);

      const state = await requestSync(created.host.match);

      expect(state.lobby.players).toHaveLength(1);
      expect(state.lobby.players[0]?.displayName).toBe("Host-A");
      expect(state.lobby.hostPlayerId).toBe(state.lobby.players[0]?.id);
      expect(state.lobby.status).toBe("open");
    } finally {
      await closePlayerConnection(created.host);
    }
  });

  it("joins an existing room by code", async () => {
    const created = await createRoomAndJoinAsHost("Host-B");
    const guest = await joinRoomByCode(created.roomCode, "Guest-B");

    try {
      const hostState = await requestSync(created.host.match);
      const guestState = await requestSync(guest.match);

      expect(hostState.lobby.players).toHaveLength(2);
      expect(guestState.lobby.players).toHaveLength(2);
      expect(hostState.lobby.players.map((player) => player.displayName).sort()).toEqual([
        "Guest-B",
        "Host-B"
      ]);
    } finally {
      await closePlayerConnection(guest);
      await closePlayerConnection(created.host);
    }
  });

  it("starts game only after 3 players are ready", async () => {
    const created = await createRoomAndJoinAsHost("Host-C");
    const guest1 = await joinRoomByCode(created.roomCode, "Guest-C1");
    const guest2 = await joinRoomByCode(created.roomCode, "Guest-C2");

    try {
      await sendAndExpectOk(created.host.match, "set_ready", {
        request_id: "ready-h",
        ready: true
      });
      await sendAndExpectOk(guest1.match, "set_ready", {
        request_id: "ready-g1",
        ready: true
      });
      await sendAndExpectOk(guest2.match, "set_ready", {
        request_id: "ready-g2",
        ready: true
      });

      await sendAndExpectOk(created.host.match, "start_game", {
        request_id: "start-1"
      });

      const state = await requestSync(created.host.match);

      expect(state.lobby.status).toBe("in_game");
      expect(state.game).not.toBeNull();
      expect(state.game?.turn.phase).toBe("roll");
      expect(state.lobby.players).toHaveLength(3);
    } finally {
      await closePlayerConnection(guest2);
      await closePlayerConnection(guest1);
      await closePlayerConnection(created.host);
    }
  });

  it("executes a simple turn and rotates active player", async () => {
    const created = await createRoomAndJoinAsHost("Host-D");
    const guest1 = await joinRoomByCode(created.roomCode, "Guest-D1");
    const guest2 = await joinRoomByCode(created.roomCode, "Guest-D2");

    try {
      await sendAndExpectOk(created.host.match, "set_ready", {
        request_id: "rd-h",
        ready: true
      });
      await sendAndExpectOk(guest1.match, "set_ready", {
        request_id: "rd-g1",
        ready: true
      });
      await sendAndExpectOk(guest2.match, "set_ready", {
        request_id: "rd-g2",
        ready: true
      });

      await sendAndExpectOk(created.host.match, "start_game", {
        request_id: "start-d"
      });

      const beforeTurn = await requestSync(created.host.match);
      const firstActivePlayerId = beforeTurn.game?.turn.activePlayerId;

      await sendAndExpectOk(created.host.match, "roll_dice", {
        request_id: "roll-d"
      });

      const afterRoll = await requestSync(created.host.match);

      if (afterRoll.game?.turn.phase === "resolve_raider") {
        const destinationTile = afterRoll.game.board.tiles.find(
          (tile) => tile.id !== afterRoll.game?.robber.tileId
        );

        if (!destinationTile) {
          throw new Error("Expected destination tile for robber movement");
        }

        await sendAndExpectOk(created.host.match, "move_robber", {
          request_id: "robber-d",
          tile_id: destinationTile.id
        });
      }

      await sendAndExpectOk(created.host.match, "end_turn", {
        request_id: "end-d"
      });

      const afterTurn = await requestSync(guest1.match);

      expect(afterTurn.game?.turn.turnNumber).toBe(2);
      expect(afterTurn.game?.turn.activePlayerId).not.toBe(firstActivePlayerId);
      expect(afterTurn.game?.turn.activePlayerId).toBe(guest1.match.sessionId);
    } finally {
      await closePlayerConnection(guest2);
      await closePlayerConnection(guest1);
      await closePlayerConnection(created.host);
    }
  });

  it("keeps lobby/game synchronization across clients", async () => {
    const created = await createRoomAndJoinAsHost("Host-E");
    const guest1 = await joinRoomByCode(created.roomCode, "Guest-E1");
    const guest2 = await joinRoomByCode(created.roomCode, "Guest-E2");

    try {
      await sendAndExpectOk(created.host.match, "set_ready", {
        request_id: "re-h",
        ready: true
      });
      await sendAndExpectOk(guest1.match, "set_ready", {
        request_id: "re-g1",
        ready: true
      });
      await sendAndExpectOk(guest2.match, "set_ready", {
        request_id: "re-g2",
        ready: true
      });

      await sendAndExpectOk(created.host.match, "start_game", {
        request_id: "start-e"
      });

      await sendAndExpectOk(created.host.match, "roll_dice", {
        request_id: "roll-e"
      });

      const hostState = await requestSync(created.host.match);
      const guestState = await requestSync(guest2.match);

      expect(guestState.revision).toBe(hostState.revision);
      expect(guestState.lobby.status).toBe("in_game");
      expect(guestState.game?.turn.turnNumber).toBe(hostState.game?.turn.turnNumber);
      expect(guestState.game?.turn.phase).toBe(hostState.game?.turn.phase);
    } finally {
      await closePlayerConnection(guest2);
      await closePlayerConnection(guest1);
      await closePlayerConnection(created.host);
    }
  });

  it("rejects critical actions outside active turn", async () => {
    const started = await createStartedThreePlayerMatch("F");

    try {
      const outOfTurnRollError = await sendAndExpectError(started.guest1.match, "roll_dice", {
        request_id: "out-turn-roll"
      });

      expect(outOfTurnRollError.code).toBe("OUT_OF_TURN");

      const outOfTurnBuildError = await sendAndExpectError(started.guest2.match, "build_road", {
        request_id: "out-turn-road",
        edge_id: "edge-0"
      });

      expect(outOfTurnBuildError.code).toBe("OUT_OF_TURN");
    } finally {
      await closePlayers([started.guest2, started.guest1, started.host]);
    }
  });

  it("rejects duplicate request ids to prevent double execution", async () => {
    const started = await createStartedThreePlayerMatch("G");

    try {
      await sendAndExpectOk(started.host.match, "roll_dice", {
        request_id: "dup-roll-1"
      });

      const duplicateError = await sendAndExpectError(started.host.match, "roll_dice", {
        request_id: "dup-roll-1"
      });

      expect(duplicateError.code).toBe("DUPLICATE_REQUEST");
    } finally {
      await closePlayers([started.guest2, started.guest1, started.host]);
    }
  });

  it("validates bank_trade payload and move_robber phase on server", async () => {
    const started = await createStartedThreePlayerMatch("H");

    try {
      const malformedTrade = await sendAndExpectError(started.host.match, "bank_trade", {
        request_id: "malformed-trade",
        give: {
          resource: "unknown",
          amount: 4
        },
        receive: {
          resource: "grain",
          amount: 1
        }
      });

      expect(malformedTrade.code).toBe("INVALID_PAYLOAD");

      await sendAndExpectOk(started.host.match, "roll_dice", {
        request_id: "roll-before-invalid-trade"
      });

      const postRollState = await requestSync(started.host.match);

      if (postRollState.game?.turn.phase === "resolve_raider") {
        const targetTile = postRollState.game.board.tiles.find(
          (tile) => tile.id !== postRollState.game?.robber.tileId
        );

        if (!targetTile) {
          throw new Error("Expected destination tile for robber movement");
        }

        await sendAndExpectOk(started.host.match, "move_robber", {
          request_id: "move-before-invalid-trade",
          tile_id: targetTile.id
        });
      }

      const invalidTrade = await sendAndExpectError(started.host.match, "bank_trade", {
        request_id: "invalid-trade",
        give: {
          resource: "timber",
          amount: 3
        },
        receive: {
          resource: "grain",
          amount: 1
        }
      });

      expect(invalidTrade.code).toBe("INVALID_TRADE");

      const invalidRobberMove = await sendAndExpectError(started.host.match, "move_robber", {
        request_id: "invalid-robber",
        tile_id: "tile-0"
      });

      expect(invalidRobberMove.code).toBe("INVALID_PHASE");
    } finally {
      await closePlayers([started.guest2, started.guest1, started.host]);
    }
  });

  it("does not leak private player states to other clients", async () => {
    const started = await createStartedThreePlayerMatch("I");

    try {
      const hostState = await requestSync(started.host.match);
      const guestState = await requestSync(started.guest1.match);

      const hostPrivatePlayerIds = Object.keys(hostState.game?.privatePlayerStates ?? {});
      const guestPrivatePlayerIds = Object.keys(guestState.game?.privatePlayerStates ?? {});

      expect(hostPrivatePlayerIds).toEqual([started.host.match.sessionId]);
      expect(guestPrivatePlayerIds).toEqual([started.guest1.match.sessionId]);
      expect(hostPrivatePlayerIds).not.toContain(started.guest1.match.sessionId);
    } finally {
      await closePlayers([started.guest2, started.guest1, started.host]);
    }
  });

  it("handles leave correctly in lobby and in match", async () => {
    const created = await createRoomAndJoinAsHost("Host-J");
    const guest = await joinRoomByCode(created.roomCode, "Guest-J");

    try {
      await closePlayerConnection(guest);

      const lobbyStateAfterLeave = await requestSync(created.host.match);
      expect(lobbyStateAfterLeave.lobby.players).toHaveLength(1);

      const started = await createStartedThreePlayerMatch("K");

      try {
        const activePlayerId = (await requestSync(started.host.match)).game?.turn.activePlayerId;

        await closePlayerConnection(started.host);

        const guestView = await requestSync(started.guest1.match);
        const disconnectedHost = guestView.lobby.players.find((player) => player.id === started.host.match.sessionId);

        expect(disconnectedHost?.isConnected).toBe(false);
        expect(guestView.game?.turn.activePlayerId).not.toBe(activePlayerId);
      } finally {
        await closePlayers([started.guest2, started.guest1]);
      }
    } finally {
      await closePlayers([created.host]);
    }
  });

  it("returns latest revision on request_sync for clients that catch up late", async () => {
    const started = await createStartedThreePlayerMatch("L");

    try {
      await sendAndExpectOk(started.host.match, "roll_dice", {
        request_id: "late-sync-roll"
      });

      const hostState = await requestSync(started.host.match);
      const guestLateSync = await requestSync(started.guest2.match);

      expect(guestLateSync.revision).toBe(hostState.revision);
      expect(guestLateSync.game?.turn.turnNumber).toBe(hostState.game?.turn.turnNumber);
      expect(guestLateSync.game?.turn.phase).toBe(hostState.game?.turn.phase);
    } finally {
      await closePlayers([started.guest2, started.guest1, started.host]);
    }
  });
});
