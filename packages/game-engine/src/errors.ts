export type EngineErrorCode =
  | "DUPLICATE_REQUEST"
  | "GAME_ALREADY_FINISHED"
  | "OUT_OF_TURN"
  | "INVALID_PHASE"
  | "PLAYER_NOT_FOUND"
  | "EDGE_NOT_FOUND"
  | "VERTEX_NOT_FOUND"
  | "TILE_NOT_FOUND"
  | "ROAD_ALREADY_EXISTS"
  | "ROAD_NOT_CONNECTED"
  | "VERTEX_OCCUPIED"
  | "SETTLEMENT_TOO_CLOSE"
  | "SETTLEMENT_NOT_CONNECTED"
  | "INSUFFICIENT_RESOURCES"
  | "BANK_INSUFFICIENT_RESOURCES"
  | "INVALID_TRADE"
  | "NOT_OWNER"
  | "OUTPOST_REQUIRED"
  | "ROBBER_SAME_TILE"
  | "ACTION_NOT_SUPPORTED";

export class GameRuleError extends Error {
  readonly code: EngineErrorCode;

  readonly details: Record<string, unknown>;

  constructor(code: EngineErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "GameRuleError";
    this.code = code;
    this.details = details;
  }
}

export function isGameRuleError(value: unknown): value is GameRuleError {
  return value instanceof GameRuleError;
}
