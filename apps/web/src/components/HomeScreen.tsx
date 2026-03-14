import React from "react";

interface HomeScreenProps {
  displayName: string;
  roomCode: string;
  isBusy: boolean;
  statusLine: string;
  onDisplayNameChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
}

export function HomeScreen({
  displayName,
  roomCode,
  isBusy,
  statusLine,
  onDisplayNameChange,
  onRoomCodeChange,
  onCreateRoom,
  onJoinRoom
}: HomeScreenProps) {
  return (
    <section className="card-float mx-auto flex w-full max-w-5xl flex-col gap-8 rounded-[2rem] panel-glass p-6 sm:p-10 lg:p-12">
      <header className="space-y-4">
        <p className="inline-flex w-fit items-center rounded-full border border-slate-700/20 bg-white/65 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-700">
          Hexaforge Arena
        </p>
        <h1 className="font-display text-4xl leading-[0.95] text-slate-900 sm:text-5xl lg:text-6xl">
          Multiplayer Strategy Match
        </h1>
        <p className="max-w-3xl text-base subtitle-muted">
          Create a room and launch a local multiplayer session with fully server-authoritative turns, resources and
          construction validation.
        </p>
      </header>

      <div className="grid gap-3 rounded-2xl border border-slate-900/10 bg-white/60 p-3 text-sm text-slate-700 sm:grid-cols-3">
        <p className="rounded-xl bg-white/80 px-3 py-2">1. Create or join with code.</p>
        <p className="rounded-xl bg-white/80 px-3 py-2">2. All players mark ready in lobby.</p>
        <p className="rounded-xl bg-white/80 px-3 py-2">3. Host starts and game syncs instantly.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="card-grid-stagger flex flex-col gap-2 text-sm font-semibold text-slate-800" htmlFor="player-name">
          Player name
          <input
            id="player-name"
            className="focus-ring rounded-xl border border-slate-300/90 bg-white/92 px-3 py-2.5 text-base shadow-sm"
            maxLength={24}
            placeholder="Navigator-01"
            value={displayName}
            onChange={(event) => onDisplayNameChange(event.currentTarget.value)}
          />
        </label>

        <label className="card-grid-stagger flex flex-col gap-2 text-sm font-semibold text-slate-800" htmlFor="room-code">
          Room code
          <input
            id="room-code"
            className="focus-ring rounded-xl border border-slate-300/90 bg-white/92 px-3 py-2.5 text-base uppercase shadow-sm"
            maxLength={6}
            placeholder="ABC123"
            value={roomCode}
            onChange={(event) => onRoomCodeChange(event.currentTarget.value)}
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          className="btn-primary inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"
          disabled={isBusy || displayName.trim().length < 2}
          type="button"
          onClick={onCreateRoom}
        >
          Create Room
        </button>
        <button
          className="btn-soft inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"
          disabled={isBusy || displayName.trim().length < 2 || roomCode.trim().length < 4}
          type="button"
          onClick={onJoinRoom}
        >
          Join by Code
        </button>
      </div>

      <p aria-live="polite" className="status-banner rounded-xl px-4 py-3 text-sm text-slate-700">
        {statusLine}
      </p>
    </section>
  );
}
