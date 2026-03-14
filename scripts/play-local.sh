#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f ".env" ]]; then
  if [[ -f ".env.example" ]]; then
    cp .env.example .env
    echo "[play:local] Created .env from .env.example"
  else
    echo "[play:local] ERROR: .env and .env.example are missing"
    exit 1
  fi
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[play:local] ERROR: DATABASE_URL is not set in .env"
  exit 1
fi

DB_HOST="$(node -e 'const u=new URL(process.env.DATABASE_URL); process.stdout.write(u.hostname);')"
DB_PORT="$(node -e 'const u=new URL(process.env.DATABASE_URL); process.stdout.write(String(u.port || 5432));')"

check_tcp() {
  local host="$1"
  local port="$2"

  node -e '
    const net = require("node:net");
    const host = process.argv[1];
    const port = Number(process.argv[2]);

    const socket = net.createConnection({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      process.exit(1);
    }, 1500);

    socket.on("connect", () => {
      clearTimeout(timeout);
      socket.end();
      process.exit(0);
    });

    socket.on("error", () => {
      clearTimeout(timeout);
      process.exit(1);
    });
  ' "$host" "$port"
}

ensure_local_postgres() {
  local host="$1"
  local port="$2"

  if [[ "$host" != "localhost" && "$host" != "127.0.0.1" ]] || [[ "$port" != "5432" ]]; then
    echo "[play:local] ERROR: PostgreSQL is not reachable at ${host}:${port}"
    echo "[play:local] Start your database and retry."
    exit 1
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "[play:local] ERROR: PostgreSQL is down and Docker is not installed"
    exit 1
  fi

  if docker ps --format '{{.Names}}' | grep -qx 'hexaforge-pg'; then
    echo "[play:local] PostgreSQL container hexaforge-pg already running"
  elif docker ps -a --format '{{.Names}}' | grep -qx 'hexaforge-pg'; then
    docker start hexaforge-pg >/dev/null
    echo "[play:local] Started existing container hexaforge-pg"
  else
    docker run --name hexaforge-pg \
      -e POSTGRES_PASSWORD=postgres \
      -e POSTGRES_DB=hexaforge \
      -p 5432:5432 -d postgres:16 >/dev/null
    echo "[play:local] Created and started container hexaforge-pg"
  fi

  for _ in {1..20}; do
    if check_tcp "$host" "$port"; then
      return
    fi
    sleep 1
  done

  echo "[play:local] ERROR: PostgreSQL did not become ready at ${host}:${port}"
  exit 1
}

if ! check_tcp "$DB_HOST" "$DB_PORT"; then
  echo "[play:local] PostgreSQL not reachable at ${DB_HOST}:${DB_PORT}. Trying local recovery..."
  ensure_local_postgres "$DB_HOST" "$DB_PORT"
fi

echo "[play:local] Running Prisma generate + push"
corepack pnpm --filter @hexaforge/game-server run prisma:generate
corepack pnpm --filter @hexaforge/game-server run prisma:push

echo "[play:local] Starting web + game server"
corepack pnpm dev
