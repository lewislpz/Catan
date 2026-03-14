import { describe, expect, it } from "vitest";

import { applyGameAction } from "./engine";
import { addResources, expectRuleError, makeEngineState, setActionPhase } from "./testUtils";

describe("stronghold upgrade", () => {
  it("upgrades only an owned outpost", () => {
    const state = makeEngineState("stronghold-seed");
    const playerId = state.game.players[0]?.id;
    const edge = state.game.board.edges[0];

    if (!playerId || !edge) {
      throw new Error("Expected fixtures to provide player and edge");
    }

    setActionPhase(state);

    state.game.buildings.push({
      id: "seed-outpost",
      type: "outpost",
      ownerId: playerId,
      vertexId: edge.vertexIds[0]
    });

    addResources(state, playerId, { grain: 2, alloy: 3 });

    const result = applyGameAction(state, {
      type: "UPGRADE_STRONGHOLD",
      requestId: "stronghold-1",
      playerId,
      vertexId: edge.vertexIds[0]
    });

    const upgraded = result.state.game.buildings.find((building) => building.vertexId === edge.vertexIds[0]);

    expect(upgraded?.type).toBe("stronghold");
    expect(result.state.game.publicPlayerStates[playerId]?.renown).toBe(2);
  });

  it("rejects upgrade when there is no owned outpost", () => {
    const state = makeEngineState("stronghold-invalid");
    const playerId = state.game.players[0]?.id;
    const vertex = state.game.board.vertices[0];

    if (!playerId || !vertex) {
      throw new Error("Expected fixtures to provide player and vertex");
    }

    setActionPhase(state);
    addResources(state, playerId, { grain: 2, alloy: 3 });

    expectRuleError(() =>
      applyGameAction(state, {
        type: "UPGRADE_STRONGHOLD",
        requestId: "stronghold-2",
        playerId,
        vertexId: vertex.id
      }),
    "OUTPOST_REQUIRED");
  });
});
