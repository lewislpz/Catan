# Hexaforge Monorepo

Hexaforge is a multiplayer web strategy game inspired by hex-tile settlement mechanics, implemented with original naming, UI, and assets. The MVP is server-authoritative and playable locally with 3 browser tabs.

## Stack

- Frontend: Next.js + React + TypeScript + Tailwind (`apps/web`)
- Multiplayer backend: Node.js + Colyseus (`apps/game-server`)
- Rules engine: pure deterministic TypeScript (`packages/game-engine`)
- Shared contracts/types: (`packages/shared`)
- Persistence: PostgreSQL + Prisma (`apps/game-server/prisma`)
- Quality: ESLint + Prettier + Vitest + React Testing Library

## Monorepo Layout

```txt
apps/
  web/
  game-server/
packages/
  game-engine/
  shared/
  config/
```

## Environment Variables

Copy `.env.example` to `.env` in repository root:

- `DATABASE_URL` PostgreSQL connection string used by Prisma
- `WEB_PORT` Next.js port (default `3000`)
- `GAME_SERVER_PORT` Colyseus HTTP/WS port (default `2567`)
- `NEXT_PUBLIC_GAME_SERVER_URL` websocket URL for web app (default `ws://localhost:2567`)

## Local Setup

1. Install dependencies:

```bash
corepack pnpm install
```

2. Prepare env:

```bash
cp .env.example .env
```

3. Start PostgreSQL (example with Docker):

```bash
docker run --name hexaforge-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=hexaforge \
  -p 5432:5432 -d postgres:16
```

4. Generate Prisma client and push schema:

```bash
corepack pnpm --filter @hexaforge/game-server run prisma:generate
corepack pnpm --filter @hexaforge/game-server run prisma:push
```

5. Run web + game server:

```bash
corepack pnpm dev
```

- Web: `http://localhost:${WEB_PORT}`
- Game server health: `http://localhost:${GAME_SERVER_PORT}/health`

Quick start (one command):

```bash
corepack pnpm play:local
```

This command ensures `.env` exists, checks local PostgreSQL (and auto-starts `hexaforge-pg` container when possible), runs Prisma generate/push, then starts web + server.

## MVP Flow (3 Players)

1. Open 3 browser tabs at the web URL.
2. Tab A creates room and shares room code.
3. Tabs B/C join by code.
4. All players toggle ready.
5. Host starts game.
6. Players take synchronized turns: roll dice, build roads/settlements/cities, move raider on 7, bank trade 4:1, end turn.
7. Server validates legal actions and rejects illegal commands.
8. Game ends automatically at target renown.

## Rules Coverage

Implemented in MVP:

- Authoritative server turn flow (`roll_dice` -> `action` -> `end_turn`)
- Deterministic board generation from seed
- Resource production (outpost = 1, stronghold = 2)
- Robber tile block on production
- Legal build validation for roads, outposts, strongholds
- Bank trade with strict `4:1`
- Victory by target renown

Simplified for MVP:

- Setup is auto-generated (not manual snake draft)
- Robber on `7` only moves tile and blocks production
- Discard/steal resolution for robber is not fully implemented

### Automatic Setup Details

At game start each player receives exactly:

- `1` outpost
- `1` connected road
- `0` starting resources

Placement is deterministic by seed and respects minimum settlement distance (no adjacent outposts). This setup is a deliberate MVP simplification to start multiplayer turns immediately.

## Scripts

- `corepack pnpm dev` run web + game-server
- `corepack pnpm play:local` bootstrap local deps and run full stack
- `corepack pnpm build` build all workspaces
- `corepack pnpm lint` run ESLint
- `corepack pnpm test` run Vitest suites
- `corepack pnpm typecheck` strict TS checks
- `corepack pnpm format` Prettier check
- `corepack pnpm format:write` Prettier write

## Architecture Notes

- Colyseus uses one match room per game instance.
- Gateway room handles `create_room` / `join_room` by code.
- Match room is authoritative for lobby + game actions.
- Engine (`packages/game-engine`) contains pure game logic; React components do not decide critical rules.
- `state_sync` is client-scoped: each client receives only its own `privatePlayerStates` entry.
- Serializable `RoomState` snapshots are persisted through Prisma.

## Current MVP Limitations

- Raider discard/steal flow is minimal (move on 7 is implemented; full discard/steal logic is pending).
- Reconnection is limited: hard reconnect to an in-progress match is not implemented. Existing clients can request fresh state with `request_sync`.
- If an active player disconnects during a match, server advances turn to next connected player (MVP fallback policy).
- Matchmaking is local/simple (no auth/account system).
- Performance/UI polish can be improved for very long sessions.
