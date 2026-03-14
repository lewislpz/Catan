import { asGameId, asPlayerId, type Player } from "@hexaforge/shared";
import { describe, expect, it } from "vitest";

import { createGame } from "./engine";

function makePlayers(): Player[] {
  return [
    {
      id: asPlayerId("p1"),
      displayName: "P1",
      color: "amber",
      isHost: true,
      isConnected: true,
      joinedAtIso: "2026-01-01T00:00:00.000Z"
    },
    {
      id: asPlayerId("p2"),
      displayName: "P2",
      color: "teal",
      isHost: false,
      isConnected: true,
      joinedAtIso: "2026-01-01T00:00:01.000Z"
    },
    {
      id: asPlayerId("p3"),
      displayName: "P3",
      color: "slate",
      isHost: false,
      isConnected: true,
      joinedAtIso: "2026-01-01T00:00:02.000Z"
    },
    {
      id: asPlayerId("p4"),
      displayName: "P4",
      color: "rose",
      isHost: false,
      isConnected: true,
      joinedAtIso: "2026-01-01T00:00:03.000Z"
    }
  ];
}

describe("starting setup", () => {
  it("assigns one legal outpost and one connected road per player", () => {
    const players = makePlayers();
    const state = createGame({
      gameId: asGameId("game-starting-1"),
      seed: "starting-seed-1",
      players
    });

    expect(state.game.buildings).toHaveLength(players.length);
    expect(state.game.roads).toHaveLength(players.length);

    const edgesById = new Map(state.game.board.edges.map((edge) => [edge.id, edge]));
    const neighborVertices = new Map<string, Set<string>>();

    for (const edge of state.game.board.edges) {
      if (!neighborVertices.has(edge.vertexIds[0])) {
        neighborVertices.set(edge.vertexIds[0], new Set<string>());
      }
      if (!neighborVertices.has(edge.vertexIds[1])) {
        neighborVertices.set(edge.vertexIds[1], new Set<string>());
      }

      neighborVertices.get(edge.vertexIds[0])?.add(edge.vertexIds[1]);
      neighborVertices.get(edge.vertexIds[1])?.add(edge.vertexIds[0]);
    }

    for (const player of players) {
      const playerBuildings = state.game.buildings.filter((building) => building.ownerId === player.id);
      const playerRoads = state.game.roads.filter((road) => road.ownerId === player.id);
      const privateState = state.game.privatePlayerStates[player.id];
      const publicState = state.game.publicPlayerStates[player.id];

      expect(playerBuildings).toHaveLength(1);
      expect(playerRoads).toHaveLength(1);
      expect(playerBuildings[0]?.type).toBe("outpost");

      const roadEdge = edgesById.get(playerRoads[0]!.edgeId);

      expect(roadEdge).toBeDefined();
      expect(roadEdge?.vertexIds).toContain(playerBuildings[0]!.vertexId);

      expect(privateState?.resources).toEqual({
        timber: 0,
        clay: 0,
        fiber: 0,
        grain: 0,
        alloy: 0
      });
      expect(publicState?.renown).toBe(1);
      expect(publicState?.buildingsBuilt).toBe(1);
      expect(publicState?.roadsBuilt).toBe(1);
    }

    for (const leftBuilding of state.game.buildings) {
      for (const rightBuilding of state.game.buildings) {
        if (leftBuilding.id === rightBuilding.id) {
          continue;
        }

        const neighbors = neighborVertices.get(leftBuilding.vertexId) ?? new Set<string>();

        expect(neighbors.has(rightBuilding.vertexId)).toBe(false);
      }
    }
  });
});
