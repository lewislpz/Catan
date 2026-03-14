import type {
  DiceRoll,
  Edge,
  GameAction,
  GameEvent,
  GameState,
  PlayerId,
  PrivatePlayerState,
  ResourceMap,
  ResourceType,
  Tile,
  Vertex
} from "@hexaforge/shared";

import { BUILD_COSTS, MAX_PROCESSED_REQUESTS } from "./constants";
import { createInitialGameState } from "./createInitialGameState";
import type { ApplyActionResult, CreateGameInput, EngineState } from "./engineTypes";
import { GameRuleError } from "./errors";
import { createSeededRng } from "./random";
import { computeRenown } from "./scoring";

const RESOURCE_ORDER: ReadonlyArray<ResourceType> = ["timber", "clay", "fiber", "grain", "alloy"];

interface ResourceAllocation {
  playerId: PlayerId;
  resource: ResourceType;
  amount: number;
}

export interface ApplyActionOptions {
  nowIso?: string;
}

export function createGame(input: CreateGameInput): EngineState {
  return {
    game: createInitialGameState(input),
    processedRequestIds: []
  };
}

function cloneEngineState(state: EngineState): EngineState {
  return structuredClone(state);
}

export function getDeterministicDiceRoll(seed: string, turnNumber: number): DiceRoll {
  const rng = createSeededRng(`${seed}:turn:${turnNumber}`);
  const dieA = (Math.floor(rng() * 6) + 1) as DiceRoll["dieA"];
  const dieB = (Math.floor(rng() * 6) + 1) as DiceRoll["dieB"];

  return {
    dieA,
    dieB,
    total: dieA + dieB
  };
}

function totalResourceCount(resources: ResourceMap): number {
  return RESOURCE_ORDER.reduce((total, resource) => total + resources[resource], 0);
}

function resourceFromTileType(tileType: Tile["type"]): ResourceType | null {
  switch (tileType) {
    case "timberland":
      return "timber";
    case "claypit":
      return "clay";
    case "fiberfield":
      return "fiber";
    case "grainplain":
      return "grain";
    case "alloyridge":
      return "alloy";
    case "badlands":
      return null;
  }
}

function requirePrivatePlayerState(game: GameState, playerId: PlayerId): PrivatePlayerState {
  const playerState = game.privatePlayerStates[playerId];

  if (!playerState) {
    throw new GameRuleError("PLAYER_NOT_FOUND", "Player state not found", {
      playerId
    });
  }

  return playerState;
}

function requireVertex(game: GameState, vertexId: Vertex["id"]): Vertex {
  const vertex = game.board.vertices.find((entry) => entry.id === vertexId);

  if (!vertex) {
    throw new GameRuleError("VERTEX_NOT_FOUND", "Vertex not found", {
      vertexId
    });
  }

  return vertex;
}

function requireEdge(game: GameState, edgeId: Edge["id"]): Edge {
  const edge = game.board.edges.find((entry) => entry.id === edgeId);

  if (!edge) {
    throw new GameRuleError("EDGE_NOT_FOUND", "Edge not found", {
      edgeId
    });
  }

  return edge;
}

function requireTile(game: GameState, tileId: Tile["id"]): Tile {
  const tile = game.board.tiles.find((entry) => entry.id === tileId);

  if (!tile) {
    throw new GameRuleError("TILE_NOT_FOUND", "Tile not found", {
      tileId
    });
  }

  return tile;
}

function assertActivePlayer(game: GameState, playerId: PlayerId): void {
  if (game.turn.activePlayerId !== playerId) {
    throw new GameRuleError("OUT_OF_TURN", "Action attempted out of turn", {
      playerId,
      activePlayerId: game.turn.activePlayerId
    });
  }
}

function assertTurnPhase(game: GameState, expectedPhase: GameState["turn"]["phase"]): void {
  if (game.turn.phase !== expectedPhase) {
    throw new GameRuleError("INVALID_PHASE", "Action attempted during invalid turn phase", {
      expectedPhase,
      currentPhase: game.turn.phase
    });
  }
}

function assertResourcesAvailable(game: GameState, playerId: PlayerId, cost: ResourceMap): void {
  const privatePlayerState = requirePrivatePlayerState(game, playerId);

  for (const resource of RESOURCE_ORDER) {
    if (privatePlayerState.resources[resource] < cost[resource]) {
      throw new GameRuleError("INSUFFICIENT_RESOURCES", "Player cannot afford action", {
        playerId,
        resource,
        required: cost[resource],
        available: privatePlayerState.resources[resource]
      });
    }
  }
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

function createSingleResourceMap(resource: ResourceType, amount: number): ResourceMap {
  return {
    ...createEmptyResourceMap(),
    [resource]: amount
  };
}

function spendResources(game: GameState, playerId: PlayerId, cost: ResourceMap): void {
  const privatePlayerState = requirePrivatePlayerState(game, playerId);

  for (const resource of RESOURCE_ORDER) {
    const spendAmount = cost[resource];

    if (spendAmount === 0) {
      continue;
    }

    privatePlayerState.resources[resource] -= spendAmount;
    game.bank.resources[resource] += spendAmount;
  }
}

function getAdjacentVertexIds(game: GameState, vertexId: Vertex["id"]): Vertex["id"][] {
  const vertex = requireVertex(game, vertexId);
  const adjacentVertexIds = new Set<Vertex["id"]>();

  for (const edgeId of vertex.adjacentEdgeIds) {
    const edge = requireEdge(game, edgeId);
    const neighborVertexId = edge.vertexIds[0] === vertexId ? edge.vertexIds[1] : edge.vertexIds[0];
    adjacentVertexIds.add(neighborVertexId);
  }

  return [...adjacentVertexIds];
}

function hasRoadAtEdge(game: GameState, edgeId: Edge["id"]): boolean {
  return game.roads.some((road) => road.edgeId === edgeId);
}

function hasBuildingAtVertex(game: GameState, vertexId: Vertex["id"]): boolean {
  return game.buildings.some((building) => building.vertexId === vertexId);
}

function refreshPlayerStateViews(game: GameState): void {
  for (const player of game.players) {
    const privatePlayerState = requirePrivatePlayerState(game, player.id);
    const publicPlayerState = game.publicPlayerStates[player.id];

    if (!publicPlayerState) {
      throw new GameRuleError("PLAYER_NOT_FOUND", "Public player state not found", {
        playerId: player.id
      });
    }

    const renown = computeRenown(game.buildings, player.id);
    const roadsBuilt = game.roads.filter((road) => road.ownerId === player.id).length;
    const buildingsBuilt = game.buildings.filter((building) => building.ownerId === player.id).length;
    const resourceCount = totalResourceCount(privatePlayerState.resources);

    privatePlayerState.renown = renown;
    privatePlayerState.roadsBuilt = roadsBuilt;
    privatePlayerState.buildingsBuilt = buildingsBuilt;
    privatePlayerState.resourceCount = resourceCount;

    publicPlayerState.renown = renown;
    publicPlayerState.roadsBuilt = roadsBuilt;
    publicPlayerState.buildingsBuilt = buildingsBuilt;
    publicPlayerState.resourceCount = resourceCount;
  }
}

function checkVictory(game: GameState, playerId: PlayerId, events: GameEvent[]): void {
  const playerPublicState = game.publicPlayerStates[playerId];

  if (!playerPublicState) {
    throw new GameRuleError("PLAYER_NOT_FOUND", "Public state missing during victory check", {
      playerId
    });
  }

  if (playerPublicState.renown < game.victoryCondition.targetRenown) {
    return;
  }

  game.winnerPlayerId = playerId;
  game.turn.phase = "finished";

  events.push({
    type: "GAME_FINISHED",
    winnerPlayerId: playerId,
    renown: playerPublicState.renown
  });
}

function canConnectRoadToPlayerNetwork(game: GameState, playerId: PlayerId, edge: Edge): boolean {
  const targetVertexIds = new Set(edge.vertexIds);

  const hasNearbyBuilding = game.buildings.some(
    (building) => building.ownerId === playerId && targetVertexIds.has(building.vertexId)
  );

  if (hasNearbyBuilding) {
    return true;
  }

  const edgeById = new Map(game.board.edges.map((boardEdge) => [boardEdge.id, boardEdge]));

  return game.roads.some((road) => {
    if (road.ownerId !== playerId) {
      return false;
    }

    const roadEdge = edgeById.get(road.edgeId);

    if (!roadEdge) {
      return false;
    }

    return roadEdge.vertexIds.some((vertexId) => targetVertexIds.has(vertexId));
  });
}

function placeTrail(
  game: GameState,
  playerId: PlayerId,
  edgeId: Edge["id"],
  events: GameEvent[]
): void {
  assertTurnPhase(game, "action");
  const edge = requireEdge(game, edgeId);

  if (hasRoadAtEdge(game, edge.id)) {
    throw new GameRuleError("ROAD_ALREADY_EXISTS", "Edge already occupied by a road", {
      edgeId
    });
  }

  if (!canConnectRoadToPlayerNetwork(game, playerId, edge)) {
    throw new GameRuleError("ROAD_NOT_CONNECTED", "Road must connect to player network", {
      edgeId,
      playerId
    });
  }

  assertResourcesAvailable(game, playerId, BUILD_COSTS.trail);
  spendResources(game, playerId, BUILD_COSTS.trail);

  const road = {
    id: `road-${game.roads.length}`,
    ownerId: playerId,
    edgeId
  };

  game.roads.push(road);
  refreshPlayerStateViews(game);

  events.push({
    type: "ROAD_PLACED",
    road
  });
}

function placeOutpost(
  game: GameState,
  playerId: PlayerId,
  vertexId: Vertex["id"],
  events: GameEvent[]
): void {
  assertTurnPhase(game, "action");
  const vertex = requireVertex(game, vertexId);

  if (hasBuildingAtVertex(game, vertex.id)) {
    throw new GameRuleError("VERTEX_OCCUPIED", "Vertex already has a building", {
      vertexId
    });
  }

  const adjacentVertexIds = getAdjacentVertexIds(game, vertex.id);

  if (adjacentVertexIds.some((neighborId) => hasBuildingAtVertex(game, neighborId))) {
    throw new GameRuleError("SETTLEMENT_TOO_CLOSE", "Minimum distance between settlements violated", {
      vertexId
    });
  }

  const connectedRoadExists = vertex.adjacentEdgeIds.some(
    (edgeId) => game.roads.some((road) => road.ownerId === playerId && road.edgeId === edgeId)
  );

  if (!connectedRoadExists) {
    throw new GameRuleError("SETTLEMENT_NOT_CONNECTED", "Outpost must connect to an owned road", {
      playerId,
      vertexId
    });
  }

  assertResourcesAvailable(game, playerId, BUILD_COSTS.outpost);
  spendResources(game, playerId, BUILD_COSTS.outpost);

  const building = {
    id: `building-${game.buildings.length}`,
    type: "outpost" as const,
    ownerId: playerId,
    vertexId
  };

  game.buildings.push(building);
  refreshPlayerStateViews(game);

  events.push({
    type: "BUILDING_PLACED",
    building
  });

  checkVictory(game, playerId, events);
}

function upgradeStronghold(
  game: GameState,
  playerId: PlayerId,
  vertexId: Vertex["id"],
  events: GameEvent[]
): void {
  assertTurnPhase(game, "action");

  const building = game.buildings.find((entry) => entry.vertexId === vertexId);

  if (!building) {
    throw new GameRuleError("OUTPOST_REQUIRED", "No outpost available to upgrade", {
      vertexId
    });
  }

  if (building.ownerId !== playerId) {
    throw new GameRuleError("NOT_OWNER", "Cannot upgrade another player's outpost", {
      vertexId,
      ownerId: building.ownerId,
      playerId
    });
  }

  if (building.type !== "outpost") {
    throw new GameRuleError("OUTPOST_REQUIRED", "Only outposts can be upgraded to strongholds", {
      vertexId,
      currentType: building.type
    });
  }

  assertResourcesAvailable(game, playerId, BUILD_COSTS.stronghold);
  spendResources(game, playerId, BUILD_COSTS.stronghold);

  building.type = "stronghold";
  refreshPlayerStateViews(game);

  events.push({
    type: "BUILDING_PLACED",
    building
  });

  checkVictory(game, playerId, events);
}

function tradeWithBank(
  game: GameState,
  playerId: PlayerId,
  give: {
    resource: ResourceType;
    amount: number;
  },
  receive: {
    resource: ResourceType;
    amount: number;
  },
  events: GameEvent[]
): void {
  assertTurnPhase(game, "action");

  if (give.amount <= 0 || receive.amount <= 0) {
    throw new GameRuleError("INVALID_TRADE", "Trade amounts must be positive integers", {
      give,
      receive
    });
  }

  if (give.resource === receive.resource) {
    throw new GameRuleError("INVALID_TRADE", "Trade resources must differ", {
      give,
      receive
    });
  }

  const expectedGiveAmount = game.bank.defaultTradeRatio * receive.amount;

  if (give.amount !== expectedGiveAmount) {
    throw new GameRuleError("INVALID_TRADE", "Invalid bank trade ratio", {
      expectedRatio: game.bank.defaultTradeRatio,
      expectedGiveAmount,
      give,
      receive
    });
  }

  assertResourcesAvailable(game, playerId, createSingleResourceMap(give.resource, give.amount));

  if (game.bank.resources[receive.resource] < receive.amount) {
    throw new GameRuleError("BANK_INSUFFICIENT_RESOURCES", "Bank cannot fulfill requested trade", {
      requested: receive,
      available: game.bank.resources[receive.resource]
    });
  }

  const privatePlayerState = requirePrivatePlayerState(game, playerId);

  privatePlayerState.resources[give.resource] -= give.amount;
  privatePlayerState.resources[receive.resource] += receive.amount;
  game.bank.resources[give.resource] += give.amount;
  game.bank.resources[receive.resource] -= receive.amount;

  refreshPlayerStateViews(game);

  events.push({
    type: "BANK_TRADE_COMPLETED",
    playerId,
    give,
    receive
  });
}

function aggregateAllocations(rawAllocations: ResourceAllocation[]): ResourceAllocation[] {
  const aggregated = new Map<string, ResourceAllocation>();

  for (const allocation of rawAllocations) {
    const key = `${allocation.playerId}:${allocation.resource}`;
    const current = aggregated.get(key);

    if (current) {
      current.amount += allocation.amount;
      continue;
    }

    aggregated.set(key, {
      ...allocation
    });
  }

  return [...aggregated.values()];
}

function distributeResources(game: GameState, diceTotal: number): ResourceAllocation[] {
  const buildingByVertexId = new Map(game.buildings.map((building) => [building.vertexId, building]));
  const allocations: ResourceAllocation[] = [];

  for (const tile of game.board.tiles) {
    if (tile.token !== diceTotal) {
      continue;
    }

    if (tile.id === game.robber.tileId) {
      continue;
    }

    const resource = resourceFromTileType(tile.type);

    if (!resource) {
      continue;
    }

    const affectedVertices = game.board.vertices.filter((vertex) => vertex.adjacentTileIds.includes(tile.id));

    for (const vertex of affectedVertices) {
      const building = buildingByVertexId.get(vertex.id);

      if (!building) {
        continue;
      }

      const grantAmount = building.type === "stronghold" ? 2 : 1;
      const bankAvailable = game.bank.resources[resource];

      if (bankAvailable <= 0) {
        continue;
      }

      const appliedAmount = Math.min(grantAmount, bankAvailable);
      const playerState = requirePrivatePlayerState(game, building.ownerId);

      playerState.resources[resource] += appliedAmount;
      game.bank.resources[resource] -= appliedAmount;

      allocations.push({
        playerId: building.ownerId,
        resource,
        amount: appliedAmount
      });
    }
  }

  refreshPlayerStateViews(game);
  return aggregateAllocations(allocations);
}

function rollDice(game: GameState, playerId: PlayerId, events: GameEvent[]): void {
  assertTurnPhase(game, "roll");

  const dice = getDeterministicDiceRoll(game.seed, game.turn.turnNumber);

  game.turn.diceRoll = dice;
  game.turn.hasRolled = true;

  events.push({
    type: "DICE_ROLLED",
    playerId,
    dice
  });

  if (dice.total === 7) {
    game.turn.phase = "resolve_raider";
    game.robber.mustDiscardPlayerIds = game.players
      .filter((player) => {
        const privatePlayerState = requirePrivatePlayerState(game, player.id);
        return totalResourceCount(privatePlayerState.resources) > 7;
      })
      .map((player) => player.id);

    return;
  }

  const allocations = distributeResources(game, dice.total);
  game.turn.phase = "action";

  events.push({
    type: "RESOURCES_PRODUCED",
    allocations
  });
}

function moveRobber(game: GameState, playerId: PlayerId, tileId: Tile["id"], events: GameEvent[]): void {
  assertTurnPhase(game, "resolve_raider");
  requireTile(game, tileId);

  if (game.robber.tileId === tileId) {
    throw new GameRuleError("ROBBER_SAME_TILE", "Robber must move to a different tile", {
      tileId
    });
  }

  game.robber.tileId = tileId;
  game.robber.mustDiscardPlayerIds = [];
  game.turn.phase = "action";

  events.push({
    type: "ROBBER_MOVED",
    tileId,
    playerId
  });
}

function endTurn(game: GameState, events: GameEvent[]): void {
  assertTurnPhase(game, "action");

  const activePlayerId = game.turn.activePlayerId;

  if (!activePlayerId) {
    throw new GameRuleError("PLAYER_NOT_FOUND", "Active player is not set", {});
  }

  const currentIndex = game.players.findIndex((player) => player.id === activePlayerId);

  if (currentIndex < 0) {
    throw new GameRuleError("PLAYER_NOT_FOUND", "Active player is missing from turn order", {
      activePlayerId
    });
  }

  const nextIndex = (currentIndex + 1) % game.players.length;
  const nextPlayer = game.players[nextIndex];

  if (!nextPlayer) {
    throw new GameRuleError("PLAYER_NOT_FOUND", "Could not resolve next player", {
      nextIndex
    });
  }

  game.turn.turnNumber += 1;
  game.turn.activePlayerId = nextPlayer.id;
  game.turn.phase = "roll";
  game.turn.diceRoll = null;
  game.turn.hasRolled = false;

  events.push({
    type: "TURN_CHANGED",
    turn: game.turn
  });
}

export function applyGameAction(
  state: EngineState,
  action: GameAction,
  options: ApplyActionOptions = {}
): ApplyActionResult {
  if (state.processedRequestIds.includes(action.requestId)) {
    throw new GameRuleError("DUPLICATE_REQUEST", "Action request was already processed", {
      requestId: action.requestId
    });
  }

  if (state.game.winnerPlayerId || state.game.turn.phase === "finished") {
    throw new GameRuleError("GAME_ALREADY_FINISHED", "Game has already finished", {
      winnerPlayerId: state.game.winnerPlayerId
    });
  }

  const nextState = cloneEngineState(state);
  const events: GameEvent[] = [];
  const activePlayerId = action.playerId;

  assertActivePlayer(nextState.game, activePlayerId);

  switch (action.type) {
    case "TURN_ROLL_DICE":
      rollDice(nextState.game, activePlayerId, events);
      break;
    case "BUILD_TRAIL":
      placeTrail(nextState.game, activePlayerId, action.edgeId, events);
      break;
    case "BUILD_OUTPOST":
      placeOutpost(nextState.game, activePlayerId, action.vertexId, events);
      break;
    case "UPGRADE_STRONGHOLD":
      upgradeStronghold(nextState.game, activePlayerId, action.vertexId, events);
      break;
    case "RAIDER_MOVE":
      moveRobber(nextState.game, activePlayerId, action.tileId, events);
      break;
    case "TURN_END":
      endTurn(nextState.game, events);
      break;
    case "TRADE_BANK":
      tradeWithBank(nextState.game, activePlayerId, action.give, action.receive, events);
      break;
    case "RAIDER_STEAL":
      throw new GameRuleError("ACTION_NOT_SUPPORTED", "Action is not implemented in phase 2", {
        actionType: action.type
      });
  }

  nextState.processedRequestIds = [...nextState.processedRequestIds, action.requestId].slice(
    -MAX_PROCESSED_REQUESTS
  );
  nextState.game.updatedAtIso = options.nowIso ?? new Date().toISOString();

  return {
    state: nextState,
    events
  };
}

export function getBuildableEdgesForPlayer(game: GameState, playerId: PlayerId): Edge["id"][] {
  return game.board.edges
    .filter((edge) => !hasRoadAtEdge(game, edge.id))
    .filter((edge) => canConnectRoadToPlayerNetwork(game, playerId, edge))
    .map((edge) => edge.id);
}

export function getBuildableOutpostVerticesForPlayer(game: GameState, playerId: PlayerId): Vertex["id"][] {
  return game.board.vertices
    .filter((vertex) => !hasBuildingAtVertex(game, vertex.id))
    .filter((vertex) => {
      const adjacentVertices = getAdjacentVertexIds(game, vertex.id);
      return adjacentVertices.every((neighborId) => !hasBuildingAtVertex(game, neighborId));
    })
    .filter((vertex) =>
      vertex.adjacentEdgeIds.some(
        (edgeId) => game.roads.some((road) => road.ownerId === playerId && road.edgeId === edgeId)
      )
    )
    .map((vertex) => vertex.id);
}

export function getUpgradeableStrongholdVerticesForPlayer(
  game: GameState,
  playerId: PlayerId
): Vertex["id"][] {
  return game.buildings
    .filter((building) => building.ownerId === playerId && building.type === "outpost")
    .map((building) => building.vertexId);
}

export function getMovableRobberTileIds(game: GameState): Tile["id"][] {
  return game.board.tiles.filter((tile) => tile.id !== game.robber.tileId).map((tile) => tile.id);
}
