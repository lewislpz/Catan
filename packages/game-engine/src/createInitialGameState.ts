import {
  asPlayerId,
  type Building,
  type Edge,
  type GameId,
  type GameState,
  type Player,
  type PrivatePlayerState,
  type PublicPlayerState,
  type ResourceMap,
  type Road,
  type Vertex
} from "@hexaforge/shared";

import { generateBoard } from "./board";
import { DEFAULT_VICTORY_TARGET, INITIAL_BANK_RESOURCES } from "./constants";
import { shuffleDeterministic } from "./random";
import { computeRenown } from "./scoring";

const EMPTY_RESOURCES: ResourceMap = {
  timber: 0,
  clay: 0,
  fiber: 0,
  grain: 0,
  alloy: 0
};

export interface CreateInitialGameStateInput {
  gameId: GameId;
  seed: string;
  players: Player[];
  nowIso?: string;
  enableStartingStructures?: boolean;
}

function buildPlayerStates(players: Player[]): {
  publicPlayerStates: Record<string, PublicPlayerState>;
  privatePlayerStates: Record<string, PrivatePlayerState>;
} {
  const publicPlayerStates: Record<string, PublicPlayerState> = {};
  const privatePlayerStates: Record<string, PrivatePlayerState> = {};

  for (const player of players) {
    const publicState: PublicPlayerState = {
      playerId: player.id,
      renown: 0,
      resourceCount: 0,
      roadsBuilt: 0,
      buildingsBuilt: 0
    };

    publicPlayerStates[player.id] = publicState;
    privatePlayerStates[player.id] = {
      ...publicState,
      resources: { ...EMPTY_RESOURCES }
    };
  }

  return {
    publicPlayerStates,
    privatePlayerStates
  };
}

function createEmptyResourceMap(): ResourceMap {
  return {
    timber: 0,
    clay: 0,
    fiber: 0,
    grain: 0,
    alloy: 0
  };
}

function getAdjacentVertexIds(board: GameState["board"], vertexId: Vertex["id"]): Vertex["id"][] {
  const adjacent = new Set<Vertex["id"]>();

  for (const edge of board.edges) {
    if (!edge.vertexIds.includes(vertexId)) {
      continue;
    }

    adjacent.add(edge.vertexIds[0] === vertexId ? edge.vertexIds[1] : edge.vertexIds[0]);
  }

  return [...adjacent];
}

function canPlaceStartingBuilding(
  board: GameState["board"],
  occupiedVertices: Set<Vertex["id"]>,
  vertexId: Vertex["id"]
): boolean {
  if (occupiedVertices.has(vertexId)) {
    return false;
  }

  return getAdjacentVertexIds(board, vertexId).every((adjacentVertexId) => !occupiedVertices.has(adjacentVertexId));
}

function pickStartingRoadEdge(
  board: GameState["board"],
  vertexId: Vertex["id"],
  occupiedEdges: Set<Edge["id"]>,
  seed: string
): Edge["id"] {
  const vertex = board.vertices.find((entry) => entry.id === vertexId);

  if (!vertex) {
    throw new Error(`Unable to resolve starting vertex '${vertexId}'`);
  }

  const shuffledEdgeIds = shuffleDeterministic([...vertex.adjacentEdgeIds], `${seed}:${vertexId}:edges`);
  const availableEdgeId = shuffledEdgeIds.find((edgeId) => !occupiedEdges.has(edgeId));

  if (!availableEdgeId) {
    throw new Error(`Unable to assign starting road for vertex '${vertexId}'`);
  }

  return availableEdgeId;
}

function createStartingStructures(
  board: GameState["board"],
  players: Player[],
  seed: string
): { buildings: Building[]; roads: Road[] } {
  const buildings: Building[] = [];
  const roads: Road[] = [];
  const occupiedVertices = new Set<Vertex["id"]>();
  const occupiedEdges = new Set<Edge["id"]>();
  const shuffledVertices = shuffleDeterministic([...board.vertices], `${seed}:starting-vertices`);

  for (const [playerIndex, player] of players.entries()) {
    const candidateVertex = shuffledVertices.find((vertex) =>
      canPlaceStartingBuilding(board, occupiedVertices, vertex.id)
    );

    if (!candidateVertex) {
      throw new Error(`Could not assign a valid starting vertex for player '${player.id}'`);
    }

    const roadEdgeId = pickStartingRoadEdge(board, candidateVertex.id, occupiedEdges, `${seed}:${player.id}`);

    occupiedVertices.add(candidateVertex.id);
    occupiedEdges.add(roadEdgeId);

    buildings.push({
      id: `starting-building-${playerIndex}`,
      type: "outpost",
      ownerId: player.id,
      vertexId: candidateVertex.id
    });

    roads.push({
      id: `starting-road-${playerIndex}`,
      ownerId: player.id,
      edgeId: roadEdgeId
    });
  }

  return {
    buildings,
    roads
  };
}

function syncInitialPlayerViews(
  players: Player[],
  publicPlayerStates: Record<string, PublicPlayerState>,
  privatePlayerStates: Record<string, PrivatePlayerState>,
  buildings: Building[],
  roads: Road[]
): void {
  for (const player of players) {
    const publicState = publicPlayerStates[player.id];
    const privateState = privatePlayerStates[player.id];

    if (!publicState || !privateState) {
      throw new Error(`Missing player state for '${player.id}' during initialization`);
    }

    const renown = computeRenown(buildings, player.id);
    const roadsBuilt = roads.filter((road) => road.ownerId === player.id).length;
    const buildingsBuilt = buildings.filter((building) => building.ownerId === player.id).length;

    publicState.renown = renown;
    publicState.roadsBuilt = roadsBuilt;
    publicState.buildingsBuilt = buildingsBuilt;
    publicState.resourceCount = 0;

    privateState.renown = renown;
    privateState.roadsBuilt = roadsBuilt;
    privateState.buildingsBuilt = buildingsBuilt;
    privateState.resourceCount = 0;
    privateState.resources = createEmptyResourceMap();
  }
}

export function createInitialGameState(input: CreateInitialGameStateInput): GameState {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const board = generateBoard(input.seed);
  const badlandsTile = board.tiles.find((tile) => tile.type === "badlands");

  if (!badlandsTile) {
    throw new Error("Board generation must include one badlands tile");
  }

  const firstPlayerId = input.players[0]?.id ?? asPlayerId("pending-player");

  const { publicPlayerStates, privatePlayerStates } = buildPlayerStates(input.players);
  const startingStructures =
    input.enableStartingStructures === false
      ? { buildings: [], roads: [] }
      : createStartingStructures(board, input.players, input.seed);

  syncInitialPlayerViews(
    input.players,
    publicPlayerStates,
    privatePlayerStates,
    startingStructures.buildings,
    startingStructures.roads
  );

  return {
    gameId: input.gameId,
    seed: input.seed,
    board,
    players: [...input.players],
    publicPlayerStates,
    privatePlayerStates,
    buildings: startingStructures.buildings,
    roads: startingStructures.roads,
    bank: {
      resources: { ...INITIAL_BANK_RESOURCES },
      defaultTradeRatio: 4
    },
    robber: {
      tileId: badlandsTile.id,
      mustDiscardPlayerIds: []
    },
    turn: {
      turnNumber: 1,
      activePlayerId: firstPlayerId,
      phase: "roll",
      diceRoll: null,
      hasRolled: false
    },
    victoryCondition: {
      targetRenown: DEFAULT_VICTORY_TARGET
    },
    winnerPlayerId: null,
    createdAtIso: nowIso,
    updatedAtIso: nowIso
  };
}
