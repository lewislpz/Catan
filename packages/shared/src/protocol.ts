import type { GameEvent, ResourceType, RoomState } from "./types";

export const ROOM_NAMES = {
  gateway: "hexaforge_gateway",
  match: "hexaforge_match"
} as const;

export interface BaseClientRequest {
  request_id: string;
}

export interface CreateRoomRequest extends BaseClientRequest {
  display_name?: string;
}

export interface JoinRoomRequest extends BaseClientRequest {
  room_code: string;
  display_name?: string;
}

export interface SetReadyRequest extends BaseClientRequest {
  ready: boolean;
}

export interface BuildRoadRequest extends BaseClientRequest {
  edge_id: string;
}

export interface BuildSettlementRequest extends BaseClientRequest {
  vertex_id: string;
}

export interface UpgradeCityRequest extends BaseClientRequest {
  vertex_id: string;
}

export interface MoveRobberRequest extends BaseClientRequest {
  tile_id: string;
}

export interface BankTradeRequest extends BaseClientRequest {
  give: {
    resource: ResourceType;
    amount: number;
  };
  receive: {
    resource: ResourceType;
    amount: number;
  };
}

export interface CreateOrJoinRoomResult {
  request_id: string;
  room_id: string;
  room_code: string;
  display_name: string | null;
}

export interface GatewaySyncMessage {
  request_id: string | null;
  available_room_codes: string[];
}

export interface StateSyncMessage {
  state: RoomState;
}

export interface CommandOkMessage {
  request_id: string;
  events: GameEvent[];
}

export interface DomainErrorMessage {
  request_id: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface GatewayClientMessageMap {
  create_room: CreateRoomRequest;
  join_room: JoinRoomRequest;
  request_sync: Partial<BaseClientRequest>;
}

export interface GatewayServerMessageMap {
  create_room_result: CreateOrJoinRoomResult;
  join_room_result: CreateOrJoinRoomResult;
  gateway_sync: GatewaySyncMessage;
  domain_error: DomainErrorMessage;
}

export interface MatchClientMessageMap {
  request_sync: Partial<BaseClientRequest>;
  set_ready: SetReadyRequest;
  start_game: BaseClientRequest;
  roll_dice: BaseClientRequest;
  build_road: BuildRoadRequest;
  build_settlement: BuildSettlementRequest;
  upgrade_city: UpgradeCityRequest;
  move_robber: MoveRobberRequest;
  bank_trade: BankTradeRequest;
  end_turn: BaseClientRequest;
}

export interface MatchServerMessageMap {
  state_sync: StateSyncMessage;
  command_ok: CommandOkMessage;
  domain_error: DomainErrorMessage;
}

export type GatewayClientMessageType = keyof GatewayClientMessageMap;
export type GatewayServerMessageType = keyof GatewayServerMessageMap;
export type MatchClientMessageType = keyof MatchClientMessageMap;
export type MatchServerMessageType = keyof MatchServerMessageMap;

export type MessageByType<
  TMap extends object,
  TType extends keyof TMap
> = {
  type: TType;
  payload: TMap[TType];
};

export function createRequestId(prefix = "req"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
