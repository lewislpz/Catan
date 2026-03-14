import { describe, expect, it } from "vitest";

import { applyGameAction } from "./engine";
import { addResources, makeEngineState, setActionPhase } from "./testUtils";

describe("victory condition", () => {
  it("ends the game when target renown is reached", () => {
    const state = makeEngineState("victory-seed");
    const playerId = state.game.players[0]?.id;
    const edge = state.game.board.edges[0];

    if (!playerId || !edge) {
      throw new Error("Expected fixtures to provide player and edge");
    }

    setActionPhase(state);
    state.game.victoryCondition.targetRenown = 1;

    state.game.roads.push({
      id: "seed-road",
      ownerId: playerId,
      edgeId: edge.id
    });

    addResources(state, playerId, { timber: 1, clay: 1, fiber: 1, grain: 1 });

    const result = applyGameAction(state, {
      type: "BUILD_OUTPOST",
      requestId: "victory-build-1",
      playerId,
      vertexId: edge.vertexIds[0]
    });

    expect(result.state.game.winnerPlayerId).toBe(playerId);
    expect(result.state.game.turn.phase).toBe("finished");
    expect(result.events.some((event) => event.type === "GAME_FINISHED")).toBe(true);
  });
});
