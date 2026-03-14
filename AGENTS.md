# Repository Guidelines

## Project Structure & Module Organization
This is a pnpm monorepo:

- `apps/web`: Next.js frontend (home, lobby, game board UI)
- `apps/game-server`: Colyseus authoritative multiplayer server + Prisma persistence
- `packages/game-engine`: pure TypeScript rules engine (deterministic, testable)
- `packages/shared`: shared domain types and network protocol contracts
- `packages/config`: shared ESLint, TypeScript, Vitest, and Prettier config

Keep game rules in `packages/game-engine` only. React components must remain UI-focused.

## Build, Test, and Development Commands
From repo root:

- `corepack pnpm install`: install workspace deps
- `corepack pnpm dev`: run web + game-server in parallel
- `corepack pnpm build`: build all packages/apps
- `corepack pnpm lint`: run ESLint across workspaces
- `corepack pnpm test`: run Vitest suites
- `corepack pnpm typecheck`: strict TypeScript checks
- `corepack pnpm format` / `format:write`: Prettier check/fix

Server database setup:

- `corepack pnpm --filter @hexaforge/game-server run prisma:generate`
- `corepack pnpm --filter @hexaforge/game-server run prisma:push`

## Coding Style & Naming Conventions
- TypeScript strict mode is required.
- Use `camelCase` for variables/functions, `PascalCase` for React components/types.
- Message names use `snake_case` and must match shared protocol types.
- Keep files ASCII unless existing content requires otherwise.
- Use ESLint + Prettier before pushing.

## Testing Guidelines
- Framework: Vitest (plus React Testing Library in web).
- Engine tests must cover domain rules and error cases.
- Server integration tests should validate create/join/start/action/sync flows.
- Test files use `*.test.ts` / `*.test.tsx` colocated under `src/`.

## Commit & Pull Request Guidelines
Prefer concise Conventional Commit messages, e.g.:

- `feat(web): add lobby and board interaction`
- `fix(engine): validate 4:1 bank trade ratio`

PRs should include:

- scope and rationale
- how to run/verify
- screenshots or short clips for UI changes
- known limitations or follow-up tasks

## Security & Configuration Tips
Use `.env` (never commit secrets). Expected variables:
`DATABASE_URL`, `WEB_PORT`, `GAME_SERVER_PORT`, `NEXT_PUBLIC_GAME_SERVER_URL`.
