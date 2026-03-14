import { describe, expect, it } from "vitest";

import { applyGameAction } from "./engine";
import { addResources, expectRuleError, makeEngineState, setActionPhase } from "./testUtils";

describe("road validation", () => {
  it("allows building a connected road and blocks duplicates", () => {
    const state = makeEngineState("road-seed");
    const playerId = state.game.players[0]?.id;
    const edge = state.game.board.edges[0];

    if (!playerId || !edge) {
      throw new Error("Expected test fixtures to provide player and edge");
    }

    setActionPhase(state);
    addResources(state, playerId, { timber: 2, clay: 2 });

    state.game.buildings.push({
      id: "seed-building",
      type: "outpost",
      ownerId: playerId,
      vertexId: edge.vertexIds[0]
    });

    const first = applyGameAction(state, {
      type: "BUILD_TRAIL",
      requestId: "road-1",
      playerId,
      edgeId: edge.id
    });

    expect(first.state.game.roads).toHaveLength(1);

    expectRuleError(() =>
      applyGameAction(first.state, {
        type: "BUILD_TRAIL",
        requestId: "road-1",
        playerId,
        edgeId: first.state.game.board.edges[1]?.id ?? edge.id
      }),
    "DUPLICATE_REQUEST");

    expectRuleError(() =>
      applyGameAction(first.state, {
        type: "BUILD_TRAIL",
        requestId: "road-2",
        playerId,
        edgeId: edge.id
      }),
    "ROAD_ALREADY_EXISTS");
  });

  it("rejects road placement outside the active turn", () => {
    const state = makeEngineState("road-out-of-turn");
    const playerId = state.game.players[1]?.id;
    const edge = state.game.board.edges[0];

    if (!playerId || !edge) {
      throw new Error("Expected test fixtures to provide player and edge");
    }

    setActionPhase(state);
    addResources(state, playerId, { timber: 1, clay: 1 });

    state.game.buildings.push({
      id: "seed-building-p2",
      type: "outpost",
      ownerId: playerId,
      vertexId: edge.vertexIds[0]
    });

    expectRuleError(() =>
      applyGameAction(state, {
        type: "BUILD_TRAIL",
        requestId: "road-3",
        playerId,
        edgeId: edge.id
      }),
    "OUT_OF_TURN");
  });
});
