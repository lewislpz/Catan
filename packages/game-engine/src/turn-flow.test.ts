import { describe, expect, it } from "vitest";

import { applyGameAction } from "./engine";
import { makeEngineState } from "./testUtils";

describe("turn flow", () => {
  it("advances to next player after ending turn", () => {
    const state = makeEngineState("turn-flow-seed");
    const firstPlayerId = state.game.players[0]?.id;
    const secondPlayerId = state.game.players[1]?.id;

    if (!firstPlayerId || !secondPlayerId) {
      throw new Error("Expected two players in fixtures");
    }

    const rolled = applyGameAction(state, {
      type: "TURN_ROLL_DICE",
      requestId: "turn-roll-1",
      playerId: firstPlayerId
    });

    let actionableState = rolled.state;

    if (rolled.state.game.turn.phase === "resolve_raider") {
      const destinationTile = rolled.state.game.board.tiles.find(
        (tile) => tile.id !== rolled.state.game.robber.tileId
      );

      if (!destinationTile) {
        throw new Error("Expected alternative tile for robber movement");
      }

      actionableState = applyGameAction(rolled.state, {
        type: "RAIDER_MOVE",
        requestId: "turn-raider-move-1",
        playerId: firstPlayerId,
        tileId: destinationTile.id
      }).state;
    }

    const ended = applyGameAction(actionableState, {
      type: "TURN_END",
      requestId: "turn-end-1",
      playerId: firstPlayerId
    });

    expect(ended.state.game.turn.turnNumber).toBe(2);
    expect(ended.state.game.turn.activePlayerId).toBe(secondPlayerId);
    expect(ended.state.game.turn.phase).toBe("roll");
    expect(ended.state.game.turn.hasRolled).toBe(false);
    expect(ended.state.game.turn.diceRoll).toBeNull();
  });
});
