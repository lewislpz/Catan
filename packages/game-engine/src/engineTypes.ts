import type { GameAction, GameEvent, GameState, Player } from "@hexaforge/shared";

export interface CreateGameInput {
  gameId: GameState["gameId"];
  seed: string;
  players: Player[];
  nowIso?: string;
  enableStartingStructures?: boolean;
}

export interface EngineState {
  game: GameState;
  processedRequestIds: string[];
}

export interface ApplyActionResult {
  state: EngineState;
  events: GameEvent[];
}

export type SupportedAction = GameAction;
