# Hexaforge - Arquitectura MVP (Actualizada)

## Principios

- Servidor autoritativo: el cliente solo envia intenciones.
- Una partida activa por `hexaforge_match` room de Colyseus.
- Reglas criticas en `packages/game-engine` (TS puro), no en React.
- Estado sincronizado por `state_sync`, con datos privados filtrados por cliente.

## Monorepo

```txt
apps/
  web/          # UI + networking cliente Colyseus
  game-server/  # gateway/match rooms, validacion, persistencia Prisma
packages/
  game-engine/  # reglas, tablero procedural, turnos, victoria
  shared/       # tipos dominio + protocolo de mensajes
  config/       # eslint/ts/prettier/vitest compartidos
```

## Flujo de rooms

1. Cliente conecta a `hexaforge_gateway`.
2. Gateway procesa `create_room` / `join_room` por codigo.
3. Cliente entra al `room_id` en `hexaforge_match`.
4. Match room controla lobby, inicio, acciones y persistencia.

## Protocolo estable

Cliente -> Gateway:
- `create_room`
- `join_room`
- `request_sync`

Cliente -> Match:
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

Match -> Cliente:
- `state_sync`
- `command_ok`
- `domain_error`

## Reglas MVP implementadas

- Turnos sincronizados (`roll` -> `action` -> `end_turn`).
- Produccion por dados, bloqueo por raider.
- Construccion legal de caminos/asentamientos/ciudades.
- Comercio banco 4:1 validado en servidor.
- Victoria por `renown` objetivo.

## Simplificaciones MVP

- Setup inicial automatico: 1 outpost + 1 road por jugador, sin recursos iniciales.
- Flujo de raider parcial: mover al sacar 7; descarte/robo completo pendiente.
- Reconexion dura a partida en curso no implementada (solo `request_sync` en cliente conectado).

## Hardening aplicado

- Deduplicacion por `request_id` (lobby + acciones engine).
- Rechazo de acciones fuera de turno/fase.
- Validacion runtime de payloads criticos en servidor.
- `state_sync` sin filtrado cruzado de `privatePlayerStates`.
- Avance automatico de turno si se desconecta el jugador activo (fallback MVP).
