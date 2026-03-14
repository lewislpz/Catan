export type Brand<TPrimitive, TName extends string> = TPrimitive & {
  readonly __brand: TName;
};

export type PlayerId = Brand<string, "PlayerId">;
export type GameId = Brand<string, "GameId">;
export type RoomCode = Brand<string, "RoomCode">;

export type ResourceType = "timber" | "clay" | "fiber" | "grain" | "alloy";

export type TileType =
  | "timberland"
  | "claypit"
  | "fiberfield"
  | "grainplain"
  | "alloyridge"
  | "badlands";

export type BuildingType = "outpost" | "stronghold";

export type TurnPhase =
  | "lobby"
  | "setup"
  | "roll"
  | "action"
  | "resolve_raider"
  | "end_turn"
  | "finished";

export type PortType = "three_to_one" | ResourceType;

export interface DiceRoll {
  dieA: 1 | 2 | 3 | 4 | 5 | 6;
  dieB: 1 | 2 | 3 | 4 | 5 | 6;
  total: number;
}

export interface VictoryCondition {
  targetRenown: number;
}

export interface Player {
  id: PlayerId;
  displayName: string;
  color: string;
  isHost: boolean;
  isConnected: boolean;
  joinedAtIso: string;
}

export type ResourceMap = Record<ResourceType, number>;

export interface PublicPlayerState {
  playerId: PlayerId;
  renown: number;
  resourceCount: number;
  roadsBuilt: number;
  buildingsBuilt: number;
}

export interface PrivatePlayerState extends PublicPlayerState {
  resources: ResourceMap;
}

export interface Tile {
  id: string;
  q: number;
  r: number;
  type: TileType;
  token: number | null;
}

export interface Vertex {
  id: string;
  x: number;
  y: number;
  adjacentTileIds: string[];
  adjacentEdgeIds: string[];
}

export interface Edge {
  id: string;
  vertexIds: [Vertex["id"], Vertex["id"]];
}

export interface Port {
  id: string;
  type: PortType;
  ratio: number;
  vertexIds: [Vertex["id"], Vertex["id"]];
}

export interface Building {
  id: string;
  type: BuildingType;
  ownerId: PlayerId;
  vertexId: Vertex["id"];
}

export interface Road {
  id: string;
  ownerId: PlayerId;
  edgeId: Edge["id"];
}

export interface Bank {
  resources: ResourceMap;
  defaultTradeRatio: 4;
}

export interface RobberState {
  tileId: Tile["id"];
  mustDiscardPlayerIds: PlayerId[];
}

export interface TurnState {
  turnNumber: number;
  activePlayerId: PlayerId | null;
  phase: TurnPhase;
  diceRoll: DiceRoll | null;
  hasRolled: boolean;
}

export interface LobbyState {
  gameId: GameId;
  roomCode: RoomCode;
  status: "open" | "in_game" | "finished";
  maxPlayers: number;
  hostPlayerId: PlayerId | null;
  players: Player[];
  readyPlayerIds: PlayerId[];
}

export interface GameState {
  gameId: GameId;
  seed: string;
  board: {
    tiles: Tile[];
    vertices: Vertex[];
    edges: Edge[];
    ports: Port[];
  };
  players: Player[];
  publicPlayerStates: Record<string, PublicPlayerState>;
  privatePlayerStates: Record<string, PrivatePlayerState>;
  buildings: Building[];
  roads: Road[];
  bank: Bank;
  robber: RobberState;
  turn: TurnState;
  victoryCondition: VictoryCondition;
  winnerPlayerId: PlayerId | null;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface RoomState {
  gameId: GameId;
  roomCode: RoomCode;
  lobby: LobbyState;
  game: GameState | null;
  revision: number;
}

export interface PersistedGame {
  id: string;
  gameId: GameId;
  roomCode: RoomCode;
  status: LobbyState["status"];
  state: RoomState;
  winnerPlayerId: PlayerId | null;
  createdAtIso: string;
  updatedAtIso: string;
  finishedAtIso: string | null;
}

export type GameAction =
  | {
      type: "TURN_ROLL_DICE";
      requestId: string;
      playerId: PlayerId;
    }
  | {
      type: "BUILD_TRAIL";
      requestId: string;
      playerId: PlayerId;
      edgeId: Edge["id"];
    }
  | {
      type: "BUILD_OUTPOST";
      requestId: string;
      playerId: PlayerId;
      vertexId: Vertex["id"];
    }
  | {
      type: "UPGRADE_STRONGHOLD";
      requestId: string;
      playerId: PlayerId;
      vertexId: Vertex["id"];
    }
  | {
      type: "TRADE_BANK";
      requestId: string;
      playerId: PlayerId;
      give: {
        resource: ResourceType;
        amount: number;
      };
      receive: {
        resource: ResourceType;
        amount: number;
      };
    }
  | {
      type: "RAIDER_MOVE";
      requestId: string;
      playerId: PlayerId;
      tileId: Tile["id"];
    }
  | {
      type: "RAIDER_STEAL";
      requestId: string;
      playerId: PlayerId;
      targetPlayerId: PlayerId;
    }
  | {
      type: "TURN_END";
      requestId: string;
      playerId: PlayerId;
    };

export type GameEvent =
  | {
      type: "TURN_CHANGED";
      turn: TurnState;
    }
  | {
      type: "DICE_ROLLED";
      playerId: PlayerId;
      dice: DiceRoll;
    }
  | {
      type: "RESOURCES_PRODUCED";
      allocations: Array<{
        playerId: PlayerId;
        resource: ResourceType;
        amount: number;
      }>;
    }
  | {
      type: "BUILDING_PLACED";
      building: Building;
    }
  | {
      type: "ROAD_PLACED";
      road: Road;
    }
  | {
      type: "ROBBER_MOVED";
      tileId: Tile["id"];
      playerId: PlayerId;
    }
  | {
      type: "BANK_TRADE_COMPLETED";
      playerId: PlayerId;
      give: {
        resource: ResourceType;
        amount: number;
      };
      receive: {
        resource: ResourceType;
        amount: number;
      };
    }
  | {
      type: "GAME_FINISHED";
      winnerPlayerId: PlayerId;
      renown: number;
    }
  | {
      type: "CMD_REJECTED";
      requestId: string;
      code: string;
      reason: string;
    };

export function asPlayerId(value: string): PlayerId {
  return value as PlayerId;
}

export function asGameId(value: string): GameId {
  return value as GameId;
}

export function asRoomCode(value: string): RoomCode {
  return value as RoomCode;
}
