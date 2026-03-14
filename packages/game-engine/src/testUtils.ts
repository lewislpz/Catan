import { asGameId, asPlayerId, type Player, type ResourceMap } from "@hexaforge/shared";
import { expect } from "vitest";

import { createGame } from "./engine";
import type { EngineState } from "./engineTypes";
import { GameRuleError } from "./errors";

const RESOURCE_ORDER: ReadonlyArray<keyof ResourceMap> = ["timber", "clay", "fiber", "grain", "alloy"];

export function makePlayers(): Player[] {
  return [
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
}

export function makeEngineState(seed = "seed-42"): EngineState {
  return createGame({
    gameId: asGameId("game-1"),
    seed,
    players: makePlayers(),
    nowIso: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    enableStartingStructures: false
  });
}

export function setActionPhase(state: EngineState): void {
  state.game.turn.phase = "action";
  state.game.turn.hasRolled = true;
}

export function addResources(
  state: EngineState,
  playerId: Player["id"],
  additions: Partial<ResourceMap>
): void {
  const privatePlayerState = state.game.privatePlayerStates[playerId];
  const publicPlayerState = state.game.publicPlayerStates[playerId];

  if (!privatePlayerState || !publicPlayerState) {
    throw new Error(`Player ${playerId} not found in state`);
  }

  for (const resource of RESOURCE_ORDER) {
    privatePlayerState.resources[resource] += additions[resource] ?? 0;
  }

  const resourceCount = RESOURCE_ORDER.reduce(
    (total, resource) => total + privatePlayerState.resources[resource],
    0
  );

  privatePlayerState.resourceCount = resourceCount;
  publicPlayerState.resourceCount = resourceCount;
}

export function expectGameRuleCode(error: unknown, expectedCode: string): void {
  expect(error).toBeInstanceOf(GameRuleError);

  const ruleError = error as GameRuleError;

  expect(ruleError.code).toBe(expectedCode);
}

export function expectRuleError(run: () => unknown, expectedCode: string): void {
  try {
    run();
    throw new Error(`Expected GameRuleError with code ${expectedCode}`);
  } catch (error) {
    expectGameRuleCode(error, expectedCode);
  }
}
