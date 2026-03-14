const roomCodeToRoomId = new Map<string, string>();

export function registerRoomCode(roomCode: string, roomId: string): void {
  roomCodeToRoomId.set(roomCode.toUpperCase(), roomId);
}

export function unregisterRoomCode(roomCode: string): void {
  roomCodeToRoomId.delete(roomCode.toUpperCase());
}

export function getRoomIdByCode(roomCode: string): string | null {
  return roomCodeToRoomId.get(roomCode.toUpperCase()) ?? null;
}

export function listRoomCodes(): string[] {
  return [...roomCodeToRoomId.keys()];
}

export function clearRoomRegistry(): void {
  roomCodeToRoomId.clear();
}
