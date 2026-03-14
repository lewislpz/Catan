import { describe, expect, it } from "vitest";

import { applyGameAction } from "./engine";
import { addResources, expectRuleError, makeEngineState, setActionPhase } from "./testUtils";

describe("bank trade", () => {
  it("trades 4:1 with bank during action phase", () => {
    const state = makeEngineState("bank-trade-seed");
    const playerId = state.game.players[0]?.id;

    if (!playerId) {
      throw new Error("Expected fixtures to provide active player");
    }

    setActionPhase(state);
    addResources(state, playerId, {
      timber: 4
    });

    const beforeTimber = state.game.privatePlayerStates[playerId]?.resources.timber ?? 0;
    const beforeGrain = state.game.privatePlayerStates[playerId]?.resources.grain ?? 0;

    const result = applyGameAction(state, {
      type: "TRADE_BANK",
      requestId: "trade-1",
      playerId,
      give: {
        resource: "timber",
        amount: 4
      },
      receive: {
        resource: "grain",
        amount: 1
      }
    });

    const afterTimber = result.state.game.privatePlayerStates[playerId]?.resources.timber ?? 0;
    const afterGrain = result.state.game.privatePlayerStates[playerId]?.resources.grain ?? 0;

    expect(afterTimber).toBe(beforeTimber - 4);
    expect(afterGrain).toBe(beforeGrain + 1);
    expect(result.events.some((event) => event.type === "BANK_TRADE_COMPLETED")).toBe(true);
  });

  it("rejects invalid ratio and same-resource trades", () => {
    const state = makeEngineState("bank-trade-invalid");
    const playerId = state.game.players[0]?.id;

    if (!playerId) {
      throw new Error("Expected fixtures to provide active player");
    }

    setActionPhase(state);
    addResources(state, playerId, {
      clay: 8
    });

    expectRuleError(
      () =>
        applyGameAction(state, {
          type: "TRADE_BANK",
          requestId: "trade-2",
          playerId,
          give: {
            resource: "clay",
            amount: 3
          },
          receive: {
            resource: "grain",
            amount: 1
          }
        }),
      "INVALID_TRADE"
    );

    expectRuleError(
      () =>
        applyGameAction(state, {
          type: "TRADE_BANK",
          requestId: "trade-3",
          playerId,
          give: {
            resource: "clay",
            amount: 4
          },
          receive: {
            resource: "clay",
            amount: 1
          }
        }),
      "INVALID_TRADE"
    );
  });
});
