import { asGameId, asPlayerId, type Player } from "@hexaforge/shared";
import { describe, expect, it } from "vitest";

import { createInitialGameState } from "./createInitialGameState";

describe("createInitialGameState", () => {
  const players: Player[] = [
    {
      id: asPlayerId("p1"),
      displayName: "Ari",
      color: "amber",
      isHost: true,
      isConnected: true,
      joinedAtIso: new Date("2026-01-01T00:00:00.000Z").toISOString()
    },
    {
      id: asPlayerId("p2"),
      displayName: "Bo",
      color: "teal",
      isHost: false,
      isConnected: true,
      joinedAtIso: new Date("2026-01-01T00:00:01.000Z").toISOString()
    }
  ];

  it("creates deterministic tiles for same seed", () => {
    const first = createInitialGameState({
      gameId: asGameId("g-1"),
      players,
      seed: "seed-42"
    });

    const second = createInitialGameState({
      gameId: asGameId("g-1"),
      players,
      seed: "seed-42"
    });

    expect(first.board.tiles).toEqual(second.board.tiles);
    expect(first.turn.activePlayerId).toBe(players[0]?.id);
    expect(first.board.tiles).toHaveLength(19);
    expect(first.board.vertices).toHaveLength(54);
    expect(first.board.edges).toHaveLength(72);
    expect(first.board.ports).toHaveLength(9);
    expect(first.turn.phase).toBe("roll");
    expect(first.buildings).toHaveLength(players.length);
    expect(first.roads).toHaveLength(players.length);
    expect(first.publicPlayerStates[players[0]!.id]?.renown).toBe(1);
  });

  it("can disable automatic starting structures for focused tests", () => {
    const game = createInitialGameState({
      gameId: asGameId("g-2"),
      players,
      seed: "seed-99",
      enableStartingStructures: false
    });

    expect(game.buildings).toHaveLength(0);
    expect(game.roads).toHaveLength(0);
    expect(game.publicPlayerStates[players[0]!.id]?.renown).toBe(0);
  });
});
