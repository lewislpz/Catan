import { describe, expect, it } from "vitest";

import { applyGameAction } from "./engine";
import { addResources, expectRuleError, makeEngineState, setActionPhase } from "./testUtils";

describe("outpost validation", () => {
  it("enforces minimum distance between outposts", () => {
    const state = makeEngineState("settlement-distance");
    const playerId = state.game.players[0]?.id;
    const edge = state.game.board.edges[0];

    if (!playerId || !edge) {
      throw new Error("Expected fixtures to provide player and edge");
    }

    setActionPhase(state);
    addResources(state, playerId, { timber: 2, clay: 2, fiber: 2, grain: 2 });

    state.game.roads.push({
      id: "seed-road",
      ownerId: playerId,
      edgeId: edge.id
    });

    const first = applyGameAction(state, {
      type: "BUILD_OUTPOST",
      requestId: "outpost-1",
      playerId,
      vertexId: edge.vertexIds[0]
    });

    expect(first.state.game.buildings).toHaveLength(1);

    expectRuleError(() =>
      applyGameAction(first.state, {
        type: "BUILD_OUTPOST",
        requestId: "outpost-2",
        playerId,
        vertexId: edge.vertexIds[1]
      }),
    "SETTLEMENT_TOO_CLOSE");
  });

  it("requires an owned connected road", () => {
    const state = makeEngineState("settlement-road-required");
    const playerId = state.game.players[0]?.id;
    const vertex = state.game.board.vertices[0];

    if (!playerId || !vertex) {
      throw new Error("Expected fixtures to provide player and vertex");
    }

    setActionPhase(state);
    addResources(state, playerId, { timber: 1, clay: 1, fiber: 1, grain: 1 });

    expectRuleError(() =>
      applyGameAction(state, {
        type: "BUILD_OUTPOST",
        requestId: "outpost-3",
        playerId,
        vertexId: vertex.id
      }),
    "SETTLEMENT_NOT_CONNECTED");
  });
});
