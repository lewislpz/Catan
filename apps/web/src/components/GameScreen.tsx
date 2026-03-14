import type { DomainErrorMessage, PlayerId, ResourceType, RoomState } from "@hexaforge/shared";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { BoardView } from "./BoardView";
import {
  deriveLegalPlacements,
  formatDomainErrorForUser,
  formatTurnPhase,
  RESOURCE_LABELS,
  type InteractionMode
} from "../lib/game-view-model";

interface GameScreenProps {
  roomState: RoomState;
  selfPlayerId: PlayerId;
  eventLines: string[];
  lastError: DomainErrorMessage | null;
  statusLine: string;
  onRollDice: () => void;
  onEndTurn: () => void;
  onBuildRoad: (edgeId: string) => void;
  onBuildSettlement: (vertexId: string) => void;
  onUpgradeCity: (vertexId: string) => void;
  onMoveRobber: (tileId: string) => void;
  onBankTrade: (giveResource: ResourceType, receiveResource: ResourceType) => void;
  onRequestSync: () => void;
  onLeave: () => void;
}

function shortPlayerId(playerId: string): string {
  return playerId.slice(0, 6);
}

function modeLabel(mode: InteractionMode): string {
  switch (mode) {
    case "road":
      return "Road placement mode";
    case "settlement":
      return "Settlement placement mode";
    case "city":
      return "City upgrade mode";
    case "robber":
      return "Raider movement mode";
    default:
      return "No placement mode";
  }
}

function phasePillClass(phase: string): string {
  switch (phase) {
    case "roll":
      return "bg-sky-100 text-sky-800 border-sky-300";
    case "action":
      return "bg-emerald-100 text-emerald-800 border-emerald-300";
    case "resolve_raider":
      return "bg-orange-100 text-orange-800 border-orange-300";
    case "finished":
      return "bg-violet-100 text-violet-800 border-violet-300";
    default:
      return "bg-slate-100 text-slate-700 border-slate-300";
  }
}

export function GameScreen({
  roomState,
  selfPlayerId,
  eventLines,
  lastError,
  statusLine,
  onRollDice,
  onEndTurn,
  onBuildRoad,
  onBuildSettlement,
  onUpgradeCity,
  onMoveRobber,
  onBankTrade,
  onRequestSync,
  onLeave
}: GameScreenProps) {
  const game = roomState.game;
  const isMyTurn = game ? game.turn.activePlayerId === selfPlayerId : false;

  const [interactionMode, setInteractionMode] = useState<InteractionMode>(null);
  const [giveResource, setGiveResource] = useState<ResourceType>("timber");
  const [receiveResource, setReceiveResource] = useState<ResourceType>("grain");
  const [phaseCueTick, setPhaseCueTick] = useState(0);
  const [turnCueTick, setTurnCueTick] = useState(0);
  const [diceCueTick, setDiceCueTick] = useState(0);
  const [modeCueTick, setModeCueTick] = useState(0);

  const previousPhaseRef = useRef<string | null>(null);
  const previousActivePlayerRef = useRef<PlayerId | null>(null);
  const previousDiceSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!game || game.turn.phase === "finished") {
      setInteractionMode(null);
      return;
    }

    if (game.turn.phase !== "action" && game.turn.phase !== "resolve_raider") {
      setInteractionMode(null);
    }

    if (game.turn.phase === "resolve_raider") {
      setInteractionMode("robber");
    }
  }, [game]);

  useEffect(() => {
    if (!game) {
      return;
    }

    if (previousPhaseRef.current && previousPhaseRef.current !== game.turn.phase) {
      setPhaseCueTick((value) => value + 1);
    }

    previousPhaseRef.current = game.turn.phase;
  }, [game]);

  useEffect(() => {
    if (!game) {
      return;
    }

    if (previousActivePlayerRef.current && previousActivePlayerRef.current !== game.turn.activePlayerId) {
      setTurnCueTick((value) => value + 1);
    }

    previousActivePlayerRef.current = game.turn.activePlayerId;
  }, [game]);

  useEffect(() => {
    if (!game) {
      return;
    }

    const diceSignature = game.turn.diceRoll
      ? `${game.turn.turnNumber}-${game.turn.diceRoll.dieA}-${game.turn.diceRoll.dieB}`
      : `none-${game.turn.turnNumber}`;

    if (
      previousDiceSignatureRef.current &&
      previousDiceSignatureRef.current !== diceSignature &&
      game.turn.diceRoll
    ) {
      setDiceCueTick((value) => value + 1);
    }

    previousDiceSignatureRef.current = diceSignature;
  }, [game]);

  useEffect(() => {
    if (!interactionMode) {
      return;
    }

    setModeCueTick((value) => value + 1);
  }, [interactionMode]);

  const actionHints = useMemo(() => {
    if (!game) {
      return [];
    }

    const hints: string[] = [];

    if (!isMyTurn) {
      hints.push("Waiting for active player");
      return hints;
    }

    if (game.turn.phase === "roll") {
      hints.push("Roll dice");
    }

    if (game.turn.phase === "action") {
      hints.push("Build road");
      hints.push("Build settlement");
      hints.push("Upgrade to city");
      hints.push("Trade with bank 4:1");
      hints.push("End turn");
    }

    if (game.turn.phase === "resolve_raider") {
      hints.push("Move raider to another tile");
    }

    if (game.turn.phase === "finished") {
      hints.push("Game finished");
    }

    return hints;
  }, [game, isMyTurn]);

  if (!game) {
    return (
      <section className="mx-auto w-full max-w-4xl rounded-3xl panel-glass p-8">
        <p className="subtitle-muted">Waiting for game state...</p>
      </section>
    );
  }

  const legalPlacements = deriveLegalPlacements(game, selfPlayerId, isMyTurn);
  const myPrivateState = game.privatePlayerStates[selfPlayerId];
  const activePlayer = game.players.find((player) => player.id === game.turn.activePlayerId);
  const lobbyPlayersById = new Map(roomState.lobby.players.map((player) => [player.id, player]));
  const resourceOptions = Object.keys(RESOURCE_LABELS) as ResourceType[];
  const recentEventLines = [...eventLines].reverse();

  return (
    <section className="game-screen-shell epic-arena-shell card-float mx-auto w-full max-w-[1540px]">
      <div className="game-layout-grid">
        <div className="game-main-column flex min-h-0 flex-col gap-4">
          <div className="panel-glass cinematic-header-panel relative overflow-hidden rounded-2xl p-4 sm:p-5">
            <span key={`phase-cue-${phaseCueTick}`} aria-hidden className="phase-cue-wave" />

            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm subtitle-muted">{statusLine}</p>
                <p className="text-sm text-slate-700">
                  Active player: <span className="font-semibold text-slate-900">{activePlayer?.displayName ?? "None"}</span>
                </p>
                <p className="text-sm text-slate-700">
                  Turn status: {isMyTurn ? "Your turn" : `Waiting (${shortPlayerId(game.turn.activePlayerId ?? "")})`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${phasePillClass(game.turn.phase)}`}>
                  {formatTurnPhase(game.turn.phase)}
                </span>
                <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  Turn {game.turn.turnNumber}
                </span>
                <span key={`turn-cue-${turnCueTick}`} className={`turn-cue-chip ${isMyTurn ? "is-you" : ""}`}>
                  {isMyTurn ? "Your Turn" : "Standby"}
                </span>
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <p
                key={`dice-cue-${diceCueTick}`}
                className={`rounded-xl border border-slate-900/10 bg-white/70 px-3 py-2 text-sm text-slate-700 ${
                  game.turn.diceRoll ? "dice-card-live" : ""
                }`}
              >
                Dice: {game.turn.diceRoll ? `${game.turn.diceRoll.dieA}+${game.turn.diceRoll.dieB}` : "Not rolled"}
              </p>
              <p
                key={`mode-cue-${modeCueTick}`}
                className="mode-cue-chip rounded-xl border border-slate-900/10 bg-white/70 px-3 py-2 text-sm text-slate-700"
              >
                Mode: {modeLabel(interactionMode)}
              </p>
              <p className="rounded-xl border border-slate-900/10 bg-white/70 px-3 py-2 text-sm text-slate-700">
                Victory target: {game.victoryCondition.targetRenown} renown
              </p>
            </div>

            {game.winnerPlayerId ? (
              <p className="mt-3 rounded-xl border border-emerald-500 bg-emerald-50/95 px-4 py-2 text-sm font-semibold text-emerald-900">
                Winner: {game.players.find((player) => player.id === game.winnerPlayerId)?.displayName ?? game.winnerPlayerId}
              </p>
            ) : null}
          </div>

          <BoardView
            cameraCueTick={phaseCueTick + turnCueTick}
            diceCueTick={diceCueTick}
            game={game}
            isMyTurn={isMyTurn}
            interactionMode={interactionMode}
            legalPlacements={legalPlacements}
            onEdgeSelect={(edgeId) => {
              onBuildRoad(edgeId);
              setInteractionMode(null);
            }}
            onTileSelect={(tileId) => {
              onMoveRobber(tileId);
              setInteractionMode(null);
            }}
            onVertexSelect={(vertexId) => {
              if (interactionMode === "city") {
                onUpgradeCity(vertexId);
              } else {
                onBuildSettlement(vertexId);
              }
              setInteractionMode(null);
            }}
          />
        </div>

        <aside className="game-log-column panel-glass rounded-2xl p-4">
          <div className="event-log-head">
            <h2 className="font-display text-xl title-gradient">Mission Feed</h2>
            <span className="event-log-counter">{eventLines.length} entries</span>
          </div>
          <p className="mt-1 text-xs subtitle-muted">Live room timeline. New events stay in view.</p>

          <div aria-live="polite" className="event-log-frame mt-3">
            {recentEventLines.length === 0 ? <p className="subtitle-muted">No events yet.</p> : null}
            {recentEventLines.map((line, index) => (
              <p
                key={`${line}-${index}`}
                className={`event-log-item rounded-md bg-white/70 px-2.5 py-2 ${index < 2 ? "is-fresh" : ""}`}
                style={{ animationDelay: `${Math.min(index, 12) * 24}ms` }}
              >
                {line}
              </p>
            ))}
          </div>
        </aside>

        <aside className="game-side-column flex min-h-0 flex-col gap-4">
          <section className="panel-glass rounded-2xl p-4">
            <h2 className="font-display text-xl title-gradient">Your Resources</h2>
            <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
              {(Object.entries(RESOURCE_LABELS) as Array<[ResourceType, string]>).map(([resource, label], index) => (
                <li
                  key={resource}
                  className="card-grid-stagger rounded-xl border border-slate-900/10 bg-white/75 px-2.5 py-1.5 text-slate-700"
                  style={{ animationDelay: `${index * 35}ms` }}
                >
                  {label}: <span className="font-semibold text-slate-900">{myPrivateState?.resources[resource] ?? 0}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-slate-700">
              Renown: <span className="font-semibold text-slate-900">{game.publicPlayerStates[selfPlayerId]?.renown ?? 0}</span>
            </p>
          </section>

          <section className="panel-glass rounded-2xl p-4">
            <h2 className="font-display text-xl title-gradient">Actions</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="btn-primary rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-45"
                disabled={!isMyTurn || game.turn.phase !== "roll"}
                type="button"
                onClick={onRollDice}
              >
                Roll Dice
              </button>

              <button
                className={`btn-soft rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-45 ${
                  interactionMode === "road" ? "action-mode-active" : ""
                }`}
                disabled={!isMyTurn || game.turn.phase !== "action"}
                type="button"
                onClick={() => setInteractionMode((value) => (value === "road" ? null : "road"))}
              >
                {interactionMode === "road" ? "Cancel Road" : "Build Road"}
              </button>

              <button
                className={`btn-soft rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-45 ${
                  interactionMode === "settlement" ? "action-mode-active" : ""
                }`}
                disabled={!isMyTurn || game.turn.phase !== "action"}
                type="button"
                onClick={() => setInteractionMode((value) => (value === "settlement" ? null : "settlement"))}
              >
                {interactionMode === "settlement" ? "Cancel Settlement" : "Build Settlement"}
              </button>

              <button
                className={`btn-soft rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-45 ${
                  interactionMode === "city" ? "action-mode-active" : ""
                }`}
                disabled={!isMyTurn || game.turn.phase !== "action"}
                type="button"
                onClick={() => setInteractionMode((value) => (value === "city" ? null : "city"))}
              >
                {interactionMode === "city" ? "Cancel City" : "Upgrade City"}
              </button>

              <button
                className={`rounded-xl border border-orange-400 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-900 transition hover:bg-orange-100 disabled:opacity-45 ${
                  interactionMode === "robber" ? "action-mode-active" : ""
                }`}
                disabled={!isMyTurn || game.turn.phase !== "resolve_raider"}
                type="button"
                onClick={() => setInteractionMode("robber")}
              >
                Move Raider
              </button>

              <button
                className="rounded-xl border border-emerald-500 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-45"
                disabled={!isMyTurn || game.turn.phase !== "action"}
                type="button"
                onClick={onEndTurn}
              >
                End Turn
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {actionHints.map((hint) => (
                <span key={hint} className="rounded-full border border-slate-900/12 bg-white/75 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {hint}
                </span>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-slate-900/10 bg-white/75 p-3">
              <p className="text-sm font-semibold text-slate-900">Bank Trade 4:1</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-700" htmlFor="give-resource">
                  Give
                  <select
                    id="give-resource"
                    className="focus-ring mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    value={giveResource}
                    onChange={(event) => setGiveResource(event.currentTarget.value as ResourceType)}
                  >
                    {resourceOptions.map((resource) => (
                      <option key={resource} value={resource}>
                        {RESOURCE_LABELS[resource]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-semibold text-slate-700" htmlFor="receive-resource">
                  Receive
                  <select
                    id="receive-resource"
                    className="focus-ring mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    value={receiveResource}
                    onChange={(event) => setReceiveResource(event.currentTarget.value as ResourceType)}
                  >
                    {resourceOptions.map((resource) => (
                      <option key={resource} value={resource}>
                        {RESOURCE_LABELS[resource]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                className="btn-primary mt-2 w-full rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-45"
                disabled={!isMyTurn || game.turn.phase !== "action" || giveResource === receiveResource}
                type="button"
                onClick={() => onBankTrade(giveResource, receiveResource)}
              >
                Trade 4 for 1
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              <button className="btn-soft rounded-xl px-3 py-2 text-sm font-semibold" type="button" onClick={onRequestSync}>
                Request Sync
              </button>
              <button className="btn-danger rounded-xl px-3 py-2 text-sm font-semibold" type="button" onClick={onLeave}>
                Leave Match
              </button>
            </div>
          </section>

          <section className="panel-glass rounded-2xl p-4">
            <h2 className="font-display text-xl title-gradient">Scoreboard</h2>
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              {game.players.map((player, index) => (
                <li
                  key={player.id}
                  className="card-grid-stagger rounded-xl border border-slate-900/10 bg-white/75 px-3 py-2"
                  style={{ animationDelay: `${index * 45}ms` }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{player.displayName}</span>
                    <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {lobbyPlayersById.get(player.id)?.isConnected ? "Online" : "Offline"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{game.publicPlayerStates[player.id]?.renown ?? 0} renown</p>
                </li>
              ))}
            </ul>
          </section>

          {lastError ? (
            <p className="rounded-xl border border-rose-300 bg-rose-50/95 px-3 py-2 text-sm text-rose-700" role="alert">
              {formatDomainErrorForUser(lastError)}
            </p>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
