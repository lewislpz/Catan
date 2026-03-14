import type { RoomState } from "@hexaforge/shared";
import type { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

let prismaClient: PrismaClient | null = null;

function getPrismaClient(): PrismaClient | null {
  if (process.env.DISABLE_PERSISTENCE === "true") {
    return null;
  }

  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!prismaClient) {
    prismaClient = new PrismaClient();
  }

  return prismaClient;
}

export async function saveRoomSnapshot(roomState: RoomState): Promise<void> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return;
  }

  try {
    await prisma.persistedGame.upsert({
      where: {
        gameId: roomState.gameId
      },
      create: {
        gameId: roomState.gameId,
        roomCode: roomState.roomCode,
        status: roomState.lobby.status,
        state: roomState as unknown as Prisma.InputJsonValue,
        winnerPlayerId: roomState.game?.winnerPlayerId ?? null,
        finishedAt: roomState.lobby.status === "finished" ? new Date() : null
      },
      update: {
        status: roomState.lobby.status,
        roomCode: roomState.roomCode,
        state: roomState as unknown as Prisma.InputJsonValue,
        winnerPlayerId: roomState.game?.winnerPlayerId ?? null,
        finishedAt: roomState.lobby.status === "finished" ? new Date() : null
      }
    });
  } catch (error) {
    console.error("[game-server] failed to persist room snapshot", error);
  }
}

export async function shutdownPersistence(): Promise<void> {
  if (prismaClient) {
    await prismaClient.$disconnect();
    prismaClient = null;
  }
}
