import type { ResourceType } from "@hexaforge/shared";
import { describe, expect, it } from "vitest";

import { applyGameAction, getDeterministicDiceRoll } from "./engine";
import { makeEngineState } from "./testUtils";

function resourceForTileType(tileType: string): ResourceType | null {
  switch (tileType) {
    case "timberland":
      return "timber";
    case "claypit":
      return "clay";
    case "fiberfield":
      return "fiber";
    case "grainplain":
      return "grain";
    case "alloyridge":
      return "alloy";
    default:
      return null;
  }
}

describe("resource production", () => {
  it("grants 1 resource for an outpost on matching tile", () => {
    const state = makeEngineState("production-seed");
    const playerId = state.game.players[0]?.id;

    if (!playerId) {
      throw new Error("Expected fixtures to provide active player");
    }

    const dice = getDeterministicDiceRoll(state.game.seed, state.game.turn.turnNumber);
    const tile = state.game.board.tiles.find((entry) => entry.type !== "badlands");

    if (!tile) {
      throw new Error("Expected board to include productive tile");
    }

    for (const boardTile of state.game.board.tiles) {
      boardTile.token = null;
    }

    tile.token = dice.total;

    const vertex = state.game.board.vertices.find((entry) => entry.adjacentTileIds.includes(tile.id));

    if (!vertex) {
      throw new Error("Expected tile to include at least one adjacent vertex");
    }

    state.game.buildings.push({
      id: "seed-outpost",
      type: "outpost",
      ownerId: playerId,
      vertexId: vertex.id
    });

    const resource = resourceForTileType(tile.type);

    if (!resource) {
      throw new Error("Expected productive tile type");
    }

    const before = state.game.privatePlayerStates[playerId]?.resources[resource] ?? 0;

    const result = applyGameAction(state, {
      type: "TURN_ROLL_DICE",
      requestId: "roll-1",
      playerId
    });

    const after = result.state.game.privatePlayerStates[playerId]?.resources[resource] ?? 0;

    expect(after - before).toBe(1);

    const productionEvent = result.events.find((event) => event.type === "RESOURCES_PRODUCED");

    expect(productionEvent?.type).toBe("RESOURCES_PRODUCED");
    if (productionEvent?.type === "RESOURCES_PRODUCED") {
      expect(productionEvent.allocations).toEqual([
        {
          playerId,
          resource,
          amount: 1
        }
      ]);
    }
  });
});
