# Game Server (Phase 3)

## Start locally

```bash
corepack pnpm install
corepack pnpm --filter @hexaforge/game-server prisma:generate
corepack pnpm --filter @hexaforge/game-server dev
```

Default runtime:
- HTTP health: `http://localhost:2567/health`
- WebSocket endpoint: `ws://localhost:2567`

## Matchmaking and room flow

1. Connect to gateway room: `hexaforge_gateway`
2. Send `create_room` or `join_room`
3. Receive `create_room_result` / `join_room_result` with `room_id` + `room_code`
4. Join match room via `joinById(room_id)` (`hexaforge_match`)

## Client intent messages (match room)

- `set_ready`
- `start_game`
- `roll_dice`
- `build_road`
- `build_settlement`
- `upgrade_city`
- `move_robber`
- `bank_trade`
- `end_turn`
- `request_sync`

Server responses:
- `state_sync` (authoritative snapshot, private player state filtered per client)
- `command_ok` (accepted command + events)
- `domain_error` (explicit rejection)

## Integration tests

```bash
corepack pnpm --filter @hexaforge/game-server test
```

Integration suite covers:
- create room
- join room by code
- start game with 3 ready players
- execute simple turn
- sync state between clients
- out-of-turn action rejection
- duplicate request-id rejection
- invalid bank trade / robber move validation
- private state non-leak between clients
- leave handling in lobby and match
