import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";


function loadDotEnvFiles(): void {
  const candidateFiles = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env")
  ];

  for (const envFile of candidateFiles) {
    if (fs.existsSync(envFile)) {
      dotenv.config({ path: envFile, override: false });
    }
  }
}

function readPort(name: string, fallback: number): number {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (Number.isNaN(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${name} must be a valid TCP port`);
  }

  return parsed;
}

loadDotEnvFiles();

export const env = {
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/hexaforge?schema=public",
  GAME_SERVER_PORT: readPort("GAME_SERVER_PORT", 2567)
};
