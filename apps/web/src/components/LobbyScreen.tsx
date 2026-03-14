import type { DomainErrorMessage, PlayerId, RoomState } from "@hexaforge/shared";
import React from "react";

import { formatDomainErrorForUser } from "../lib/game-view-model";

interface LobbyScreenProps {
  roomState: RoomState;
  selfPlayerId: PlayerId;
  statusLine: string;
  lastError: DomainErrorMessage | null;
  isBusy: boolean;
  onSetReady: (ready: boolean) => void;
  onStartGame: () => void;
  onRequestSync: () => void;
  onLeave: () => void;
}

export function LobbyScreen({
  roomState,
  selfPlayerId,
  statusLine,
  lastError,
  isBusy,
  onSetReady,
  onStartGame,
  onRequestSync,
  onLeave
}: LobbyScreenProps) {
  const players = roomState.lobby.players;
  const readyIds = new Set(roomState.lobby.readyPlayerIds);
  const selfPlayer = players.find((player) => player.id === selfPlayerId);
  const selfReady = readyIds.has(selfPlayerId);
  const isHost = roomState.lobby.hostPlayerId === selfPlayerId;
  const allReady = players.every((player) => readyIds.has(player.id));
  const allConnected = players.every((player) => player.isConnected);
  const validPlayerCount = players.length === 3 || players.length === 4;
  const readyRatio = players.length > 0 ? Math.round((roomState.lobby.readyPlayerIds.length / players.length) * 100) : 0;

  return (
    <section className="card-float mx-auto flex w-full max-w-6xl flex-col gap-6 rounded-[2rem] panel-glass p-6 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">Room Code</p>
          <h1 className="font-display text-5xl title-gradient" aria-label="Room code">
            {roomState.roomCode}
          </h1>
          <p className="subtitle-muted text-sm">Host can start only with 3 or 4 connected and ready players.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="btn-soft rounded-xl px-4 py-2.5 text-sm font-semibold" type="button" onClick={onRequestSync}>
            Refresh Sync
          </button>
          <button className="btn-danger rounded-xl px-4 py-2.5 text-sm font-semibold" type="button" onClick={onLeave}>
            Leave Room
          </button>
        </div>
      </header>

      <div className="grid gap-3 rounded-2xl border border-slate-900/10 bg-white/65 p-4 sm:grid-cols-3">
        <p className="rounded-xl bg-white/70 px-3 py-2 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">You:</span> {selfPlayer?.displayName ?? "Unknown"}
        </p>
        <p className="rounded-xl bg-white/70 px-3 py-2 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">Players:</span> {players.length}/{roomState.lobby.maxPlayers}
        </p>
        <p className="rounded-xl bg-white/70 px-3 py-2 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">Lobby:</span> {statusLine}
        </p>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-900/10 bg-white/70 p-4">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-600">
          <span>Ready Progress</span>
          <span>{readyRatio}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-600 to-amber-500 transition-all duration-500"
            style={{ width: `${readyRatio}%` }}
          />
        </div>
      </section>

      <ul className="grid gap-3 sm:grid-cols-2">
        {players.map((player, index) => {
          const ready = readyIds.has(player.id);

          return (
            <li
              key={player.id}
              aria-label={`Player ${player.displayName} status`}
              className="card-grid-stagger rounded-2xl border border-slate-900/10 bg-white/75 p-4"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-base font-semibold text-slate-900">
                  {player.displayName}
                  {player.id === selfPlayerId ? " (You)" : ""}
                </p>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    ready
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {ready ? "Ready" : "Pending"}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-700">Role: {player.isHost ? "Host" : "Guest"}</p>
              <p className="mt-1 text-sm text-slate-700">
                Connection: {player.isConnected ? "Connected" : "Disconnected"}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-3">
        <button
          className="btn-primary rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-45"
          type="button"
          onClick={() => onSetReady(!selfReady)}
        >
          {selfReady ? "Set Not Ready" : "Set Ready"}
        </button>
        <button
          className="btn-soft rounded-xl border-emerald-700/40 bg-emerald-50/75 px-4 py-2.5 text-sm font-semibold text-emerald-900 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!isHost || !validPlayerCount || !allReady || !allConnected || isBusy}
          type="button"
          onClick={onStartGame}
        >
          Start Game (Host)
        </button>
      </div>

      <div className="rounded-xl border border-slate-900/10 bg-white/70 p-4 text-sm text-slate-700">
        Start requirements: player count ({validPlayerCount ? "OK" : "Need 3 or 4"}), readiness ({allReady ? "OK" : "Missing ready"}),
        connection ({allConnected ? "OK" : "Disconnected player"}).
      </div>

      {lastError ? (
        <p className="rounded-xl border border-rose-300 bg-rose-50/90 px-4 py-3 text-sm text-rose-700" role="alert">
          {formatDomainErrorForUser(lastError)}
        </p>
      ) : null}
    </section>
  );
}
