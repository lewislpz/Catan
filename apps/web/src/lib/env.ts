const DEFAULT_GAME_SERVER_URL = "ws://localhost:2567";

export const publicEnv = {
  gameServerUrl: process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? DEFAULT_GAME_SERVER_URL
};
