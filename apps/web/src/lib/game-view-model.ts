import {
  getBuildableEdgesForPlayer,
  getBuildableOutpostVerticesForPlayer,
  getMovableRobberTileIds,
  getUpgradeableStrongholdVerticesForPlayer
} from "@hexaforge/game-engine";
import type {
  DomainErrorMessage,
  GameEvent,
  GameState,
  PlayerId,
  ResourceType,
  TurnPhase
} from "@hexaforge/shared";

export type InteractionMode = "road" | "settlement" | "city" | "robber" | null;

export interface LegalPlacements {
  roadEdgeIds: Set<string>;
  settlementVertexIds: Set<string>;
  cityVertexIds: Set<string>;
  robberTileIds: Set<string>;
}

export const RESOURCE_LABELS: Record<ResourceType, string> = {
  timber: "Timber",
  clay: "Clay",
  fiber: "Fiber",
  grain: "Grain",
  alloy: "Alloy"
};

export function deriveLegalPlacements(
  game: GameState,
  playerId: PlayerId | null,
  isPlayerTurn: boolean
): LegalPlacements {
  if (!playerId || !isPlayerTurn) {
    return {
      roadEdgeIds: new Set<string>(),
      settlementVertexIds: new Set<string>(),
      cityVertexIds: new Set<string>(),
      robberTileIds: new Set<string>()
    };
  }

  return {
    roadEdgeIds: new Set(game.turn.phase === "action" ? getBuildableEdgesForPlayer(game, playerId) : []),
    settlementVertexIds: new Set(
      game.turn.phase === "action" ? getBuildableOutpostVerticesForPlayer(game, playerId) : []
    ),
    cityVertexIds: new Set(
      game.turn.phase === "action" ? getUpgradeableStrongholdVerticesForPlayer(game, playerId) : []
    ),
    robberTileIds: new Set(game.turn.phase === "resolve_raider" ? getMovableRobberTileIds(game) : [])
  };
}

export function formatTurnPhase(phase: TurnPhase): string {
  switch (phase) {
    case "lobby":
      return "Lobby";
    case "setup":
      return "Setup";
    case "roll":
      return "Roll Dice";
    case "action":
      return "Action";
    case "resolve_raider":
      return "Move Raider";
    case "end_turn":
      return "End Turn";
    case "finished":
      return "Finished";
  }
}

function resolvePlayerName(game: GameState, playerId: PlayerId): string {
  return game.players.find((player) => player.id === playerId)?.displayName ?? playerId;
}

export function formatEventLine(game: GameState, event: GameEvent): string {
  switch (event.type) {
    case "TURN_CHANGED":
      return `Turn ${event.turn.turnNumber}: ${
        event.turn.activePlayerId ? resolvePlayerName(game, event.turn.activePlayerId) : "No active player"
      }`;
    case "DICE_ROLLED":
      return `${resolvePlayerName(game, event.playerId)} rolled ${event.dice.total} (${event.dice.dieA}+${event.dice.dieB})`;
    case "RESOURCES_PRODUCED": {
      if (event.allocations.length === 0) {
        return "No resources produced";
      }

      const chunks = event.allocations.map((allocation) => {
        const playerName = resolvePlayerName(game, allocation.playerId);
        return `${playerName} +${allocation.amount} ${RESOURCE_LABELS[allocation.resource]}`;
      });

      return `Production: ${chunks.join(", ")}`;
    }
    case "ROAD_PLACED":
      return `${resolvePlayerName(game, event.road.ownerId)} built a road`;
    case "BUILDING_PLACED":
      return `${resolvePlayerName(game, event.building.ownerId)} ${
        event.building.type === "stronghold" ? "upgraded to stronghold" : "built an outpost"
      }`;
    case "ROBBER_MOVED":
      return `${resolvePlayerName(game, event.playerId)} moved the raider`;
    case "BANK_TRADE_COMPLETED":
      return `${resolvePlayerName(game, event.playerId)} traded ${event.give.amount} ${RESOURCE_LABELS[event.give.resource]} for ${event.receive.amount} ${RESOURCE_LABELS[event.receive.resource]}`;
    case "GAME_FINISHED":
      return `${resolvePlayerName(game, event.winnerPlayerId)} wins with ${event.renown} renown`;
    case "CMD_REJECTED":
      return `Rejected: ${event.code} (${event.reason})`;
  }
}

export function formatDomainErrorForUser(error: DomainErrorMessage): string {
  const map: Record<string, string> = {
    OUT_OF_TURN: "No es tu turno.",
    INVALID_PHASE: "Esa accion no esta permitida en la fase actual.",
    DUPLICATE_REQUEST: "La accion ya fue procesada previamente.",
    INSUFFICIENT_RESOURCES: "No tienes recursos suficientes para esta accion.",
    SETTLEMENT_TOO_CLOSE: "No puedes construir tan cerca de otro asentamiento.",
    SETTLEMENT_NOT_CONNECTED: "El asentamiento debe conectar con un camino tuyo.",
    ROAD_NOT_CONNECTED: "El camino debe conectar con tu red.",
    ROAD_ALREADY_EXISTS: "Ya existe un camino en esa arista.",
    VERTEX_OCCUPIED: "La posicion ya esta ocupada.",
    OUTPOST_REQUIRED: "Necesitas un asentamiento propio para mejorarlo a ciudad.",
    NOT_OWNER: "No puedes modificar estructuras de otro jugador.",
    INVALID_TRADE: "El comercio con banco debe cumplir la relacion 4:1.",
    BANK_INSUFFICIENT_RESOURCES: "El banco no tiene recursos para completar ese comercio.",
    ROBBER_SAME_TILE: "El bandido debe moverse a una loseta distinta.",
    PLAYER_DISCONNECTED: "Ese jugador esta desconectado."
  };

  return map[error.code] ?? `${error.code}: ${error.message}`;
}
