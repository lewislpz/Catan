import { describe, expect, it } from "vitest";

import { applyGameAction, getDeterministicDiceRoll } from "./engine";
import { addResources, makeEngineState } from "./testUtils";

function findSeedThatRollsSeven(): string {
  for (let index = 0; index < 5000; index += 1) {
    const candidate = `seven-seed-${index}`;
    const dice = getDeterministicDiceRoll(candidate, 1);

    if (dice.total === 7) {
      return candidate;
    }
  }

  throw new Error("Failed to find seed that rolls 7 in deterministic search range");
}

describe("robber on dice total 7", () => {
  it("switches to robber resolution phase and marks players that must discard", () => {
    const seed = findSeedThatRollsSeven();
    const state = makeEngineState(seed);
    const firstPlayerId = state.game.players[0]?.id;
    const secondPlayerId = state.game.players[1]?.id;

    if (!firstPlayerId || !secondPlayerId) {
      throw new Error("Expected two players in fixtures");
    }

    addResources(state, firstPlayerId, {
      timber: 8
    });
    addResources(state, secondPlayerId, {
      clay: 6
    });

    const rolled = applyGameAction(state, {
      type: "TURN_ROLL_DICE",
      requestId: "robber-seven-roll",
      playerId: firstPlayerId
    });

    expect(rolled.state.game.turn.phase).toBe("resolve_raider");
    expect(rolled.state.game.robber.mustDiscardPlayerIds).toEqual([firstPlayerId]);

    const destination = rolled.state.game.board.tiles.find(
      (tile) => tile.id !== rolled.state.game.robber.tileId
    );

    if (!destination) {
      throw new Error("Expected alternate tile for robber movement");
    }

    const moved = applyGameAction(rolled.state, {
      type: "RAIDER_MOVE",
      requestId: "robber-seven-move",
      playerId: firstPlayerId,
      tileId: destination.id
    });

    expect(moved.state.game.turn.phase).toBe("action");
    expect(moved.state.game.robber.tileId).toBe(destination.id);
    expect(moved.state.game.robber.mustDiscardPlayerIds).toHaveLength(0);
  });
});
