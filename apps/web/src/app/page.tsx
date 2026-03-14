"use client";

import { asPlayerId, type DomainErrorMessage, type GameEvent, type PlayerId, type ResourceType, type RoomState } from "@hexaforge/shared";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GameScreen } from "../components/GameScreen";
import { HomeScreen } from "../components/HomeScreen";
import { LobbyScreen } from "../components/LobbyScreen";
import { HexaforgeClient } from "../lib/game-client";
import { formatDomainErrorForUser, formatEventLine } from "../lib/game-view-model";

const DISPLAY_NAME_STORAGE_KEY = "hexaforge.display_name";
const SOUND_ENABLED_STORAGE_KEY = "hexaforge.sound_enabled";
const MAX_EVENT_LOG_LINES = 120;
const MAX_TOASTS = 4;
const TOAST_DURATION_MS = 3600;

type UiStage = "home" | "lobby" | "game";
type UiToastTone = "info" | "success" | "error";
type UiSoundCue = "tap" | "success" | "error" | "turn" | "victory";

interface UiToast {
  id: string;
  tone: UiToastTone;
  text: string;
}

interface LegacyAudioWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function nowTag(): string {
  return new Date().toLocaleTimeString();
}

function stageLabel(stage: UiStage): string {
  switch (stage) {
    case "home":
      return "Gateway";
    case "lobby":
      return "Lobby";
    case "game":
      return "Battleboard";
    default:
      return "Unknown";
  }
}

function toastId(): string {
  return `toast-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function playNote(
  context: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  gainAmount: number,
  wave: OscillatorType
): void {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(gainAmount, startTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.03);
}

function playSoundCue(context: AudioContext, cue: UiSoundCue): void {
  const start = context.currentTime + 0.01;

  switch (cue) {
    case "tap":
      playNote(context, 520, start, 0.08, 0.035, "triangle");
      break;
    case "success":
      playNote(context, 480, start, 0.11, 0.035, "triangle");
      playNote(context, 720, start + 0.08, 0.14, 0.03, "triangle");
      break;
    case "error":
      playNote(context, 320, start, 0.14, 0.035, "sawtooth");
      playNote(context, 210, start + 0.08, 0.16, 0.03, "sawtooth");
      break;
    case "turn":
      playNote(context, 660, start, 0.1, 0.03, "sine");
      playNote(context, 830, start + 0.09, 0.12, 0.028, "sine");
      break;
    case "victory":
      playNote(context, 392, start, 0.2, 0.03, "triangle");
      playNote(context, 494, start + 0.1, 0.22, 0.028, "triangle");
      playNote(context, 587, start + 0.18, 0.28, 0.026, "triangle");
      break;
    default:
      break;
  }
}

export default function HomePage() {
  const [displayName, setDisplayName] = useState("Navigator");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [selfPlayerId, setSelfPlayerId] = useState<PlayerId | null>(null);
  const [statusLine, setStatusLine] = useState("Enter your name to create or join a room.");
  const [isBusy, setIsBusy] = useState(false);
  const [lastError, setLastError] = useState<DomainErrorMessage | null>(null);
  const [eventLines, setEventLines] = useState<string[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [toasts, setToasts] = useState<UiToast[]>([]);

  const clientRef = useRef<HexaforgeClient | null>(null);
  const roomStateRef = useRef<RoomState | null>(null);
  const selfPlayerIdRef = useRef<PlayerId | null>(null);
  const listenersRef = useRef<Array<() => void>>([]);
  const toastTimeoutIdsRef = useRef<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const winnerAnnouncementRef = useRef<PlayerId | null>(null);
  const activePlayerTurnRef = useRef<PlayerId | null>(null);

  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  useEffect(() => {
    selfPlayerIdRef.current = selfPlayerId;
  }, [selfPlayerId]);

  useEffect(() => {
    const persistedName = window.localStorage.getItem(DISPLAY_NAME_STORAGE_KEY);
    const persistedSound = window.localStorage.getItem(SOUND_ENABLED_STORAGE_KEY);

    if (persistedName?.trim()) {
      setDisplayName(persistedName.trim().slice(0, 24));
    }

    if (persistedSound === "1") {
      setSoundEnabled(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, displayName);
  }, [displayName]);

  useEffect(() => {
    window.localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, soundEnabled ? "1" : "0");
  }, [soundEnabled]);

  useEffect(() => {
    return () => {
      clearListeners();
      for (const timeoutId of toastTimeoutIdsRef.current) {
        window.clearTimeout(timeoutId);
      }
      toastTimeoutIdsRef.current = [];

      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }

      if (!clientRef.current) {
        return;
      }

      void clientRef.current.disconnect();
    };
  }, []);

  const stage = useMemo<UiStage>(() => {
    if (!roomState) {
      return "home";
    }

    if (roomState.game) {
      return "game";
    }

    return "lobby";
  }, [roomState]);

  const pushToast = useCallback((text: string, tone: UiToastTone): void => {
    const id = toastId();

    setToasts((current) => [...current, { id, text, tone }].slice(-MAX_TOASTS));

    const timeoutId = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      toastTimeoutIdsRef.current = toastTimeoutIdsRef.current.filter((entry) => entry !== timeoutId);
    }, TOAST_DURATION_MS);

    toastTimeoutIdsRef.current.push(timeoutId);
  }, []);

  const triggerSound = useCallback(
    (cue: UiSoundCue, force = false): void => {
      if (!force && !soundEnabled) {
        return;
      }

      const audioWindow = window as LegacyAudioWindow;
      const AudioContextCtor = window.AudioContext ?? audioWindow.webkitAudioContext;

      if (!AudioContextCtor) {
        return;
      }

      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContextCtor();
        }

        const context = audioContextRef.current;

        if (!context) {
          return;
        }

        if (context.state === "suspended") {
          void context.resume();
        }

        playSoundCue(context, cue);
      } catch {
        return;
      }
    },
    [soundEnabled]
  );

  const toggleSound = useCallback((): void => {
    const nextValue = !soundEnabled;
    setSoundEnabled(nextValue);

    if (nextValue) {
      triggerSound("tap", true);
      pushToast("Sound effects enabled", "info");
      return;
    }

    pushToast("Sound effects muted", "info");
  }, [soundEnabled, pushToast, triggerSound]);

  function getClient(): HexaforgeClient {
    if (!clientRef.current) {
      clientRef.current = new HexaforgeClient();
    }

    return clientRef.current;
  }

  function clearListeners(): void {
    for (const cleanup of listenersRef.current) {
      cleanup();
    }

    listenersRef.current = [];
  }

  function appendLogLine(line: string): void {
    setEventLines((current) => [...current, `[${nowTag()}] ${line}`].slice(-MAX_EVENT_LOG_LINES));
  }

  function attachRoomListeners(client: HexaforgeClient): void {
    clearListeners();

    listenersRef.current.push(
      client.onStateSync((nextState) => {
        setRoomState(nextState);

        if (nextState.game?.winnerPlayerId) {
          const winnerId = nextState.game.winnerPlayerId;
          const winnerName = nextState.game.players.find((player) => player.id === winnerId)?.displayName;

          if (winnerAnnouncementRef.current !== winnerId) {
            winnerAnnouncementRef.current = winnerId;
            pushToast(`Winner: ${winnerName ?? winnerId}`, "success");
            triggerSound("victory");
          }

          setStatusLine(`Game finished. Winner: ${winnerName ?? winnerId}`);
          return;
        }

        winnerAnnouncementRef.current = null;

        const previousActivePlayer = activePlayerTurnRef.current;
        const nextActivePlayer = nextState.game?.turn.activePlayerId ?? null;
        activePlayerTurnRef.current = nextActivePlayer;

        if (
          nextActivePlayer &&
          previousActivePlayer !== nextActivePlayer &&
          selfPlayerIdRef.current &&
          nextActivePlayer === selfPlayerIdRef.current
        ) {
          pushToast("Your turn", "info");
          triggerSound("turn");
        }

        setStatusLine(`Synced revision ${nextState.revision}`);
      })
    );

    listenersRef.current.push(
      client.onCommandOk((payload) => {
        setLastError(null);
        setStatusLine(`Command accepted: ${payload.request_id}`);
        triggerSound("success");

        if (payload.events.length > 0) {
          pushToast(`${payload.events.length} event(s) applied`, "success");
        }

        const game = roomStateRef.current?.game;

        if (!game) {
          appendLogLine(`Command accepted: ${payload.request_id}`);
          return;
        }

        for (const rawEvent of payload.events) {
          const event = rawEvent as GameEvent;
          appendLogLine(formatEventLine(game, event));
        }
      })
    );

    listenersRef.current.push(
      client.onDomainError((error) => {
        setLastError(error);
        const userMessage = formatDomainErrorForUser(error);
        setStatusLine(userMessage);
        appendLogLine(`Rejected: ${userMessage}`);
        pushToast(userMessage, "error");
        triggerSound("error");
      })
    );
  }

  async function connectToRoom(roomId: string, normalizedName: string, roomCode?: string): Promise<void> {
    const client = getClient();

    await client.joinMatchRoom(roomId, normalizedName);

    const sessionId = client.getSessionPlayerId();

    if (!sessionId) {
      throw new Error("Missing session id after joining match room");
    }

    setSelfPlayerId(asPlayerId(sessionId));
    setLastError(null);
    setEventLines([]);
    winnerAnnouncementRef.current = null;
    activePlayerTurnRef.current = null;
    attachRoomListeners(client);
    client.requestSync();

    setStatusLine(roomCode ? `Connected to room ${roomCode}` : "Connected to room");
    pushToast(roomCode ? `Connected to ${roomCode}` : "Connected to room", "success");
    triggerSound("success");
  }

  async function handleCreateRoom(): Promise<void> {
    const normalizedName = displayName.trim().slice(0, 24);

    if (normalizedName.length < 2) {
      setStatusLine("Name must have at least 2 characters.");
      pushToast("Name must have at least 2 characters.", "error");
      triggerSound("error");
      return;
    }

    setIsBusy(true);
    triggerSound("tap");

    try {
      const client = getClient();
      const createResult = await client.createRoom(normalizedName);

      await connectToRoom(createResult.room_id, normalizedName, createResult.room_code);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusLine(`Create room failed: ${message}`);
      appendLogLine(`Create room failed: ${message}`);
      pushToast(`Create failed: ${message}`, "error");
      triggerSound("error");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleJoinRoom(): Promise<void> {
    const normalizedName = displayName.trim().slice(0, 24);
    const normalizedRoomCode = roomCodeInput.trim().toUpperCase();

    if (normalizedName.length < 2) {
      setStatusLine("Name must have at least 2 characters.");
      pushToast("Name must have at least 2 characters.", "error");
      triggerSound("error");
      return;
    }

    if (normalizedRoomCode.length < 4) {
      setStatusLine("Room code must have at least 4 characters.");
      pushToast("Room code must have at least 4 characters.", "error");
      triggerSound("error");
      return;
    }

    setIsBusy(true);
    triggerSound("tap");

    try {
      const client = getClient();
      const joinResult = await client.joinRoom(normalizedRoomCode, normalizedName);

      await connectToRoom(joinResult.room_id, normalizedName, joinResult.room_code);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusLine(`Join room failed: ${message}`);
      appendLogLine(`Join room failed: ${message}`);
      pushToast(`Join failed: ${message}`, "error");
      triggerSound("error");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLeave(): Promise<void> {
    setIsBusy(true);

    try {
      clearListeners();

      if (clientRef.current) {
        await clientRef.current.disconnect();
      }

      setRoomState(null);
      setSelfPlayerId(null);
      setLastError(null);
      winnerAnnouncementRef.current = null;
      activePlayerTurnRef.current = null;
      setStatusLine("Disconnected. You can create or join another room.");
      appendLogLine("Disconnected from room");
      pushToast("Disconnected from room", "info");
    } finally {
      setIsBusy(false);
    }
  }

  function withClient(run: (client: HexaforgeClient) => void): void {
    if (!clientRef.current) {
      setStatusLine("Client is not connected.");
      pushToast("Client is not connected.", "error");
      triggerSound("error");
      return;
    }

    run(clientRef.current);
  }

  function handleRequestSync(): void {
    withClient((client) => {
      client.requestSync();
      setStatusLine("Sync requested.");
      triggerSound("tap");
    });
  }

  function handleSetReady(ready: boolean): void {
    withClient((client) => {
      const requestId = client.setReady(ready);
      setStatusLine(`Ready state sent (${requestId})`);
      triggerSound("tap");
    });
  }

  function handleStartGame(): void {
    withClient((client) => {
      const requestId = client.startGame();
      setStatusLine(`Start game requested (${requestId})`);
      triggerSound("tap");
    });
  }

  function handleRollDice(): void {
    withClient((client) => {
      const requestId = client.rollDice();
      setStatusLine(`Roll requested (${requestId})`);
      triggerSound("tap");
    });
  }

  function handleBuildRoad(edgeId: string): void {
    withClient((client) => {
      const requestId = client.buildRoad(edgeId);
      setStatusLine(`Build road requested (${requestId})`);
      triggerSound("tap");
    });
  }

  function handleBuildSettlement(vertexId: string): void {
    withClient((client) => {
      const requestId = client.buildSettlement(vertexId);
      setStatusLine(`Build settlement requested (${requestId})`);
      triggerSound("tap");
    });
  }

  function handleUpgradeCity(vertexId: string): void {
    withClient((client) => {
      const requestId = client.upgradeCity(vertexId);
      setStatusLine(`Upgrade requested (${requestId})`);
      triggerSound("tap");
    });
  }

  function handleMoveRobber(tileId: string): void {
    withClient((client) => {
      const requestId = client.moveRobber(tileId);
      setStatusLine(`Move raider requested (${requestId})`);
      triggerSound("tap");
    });
  }

  function handleBankTrade(giveResource: ResourceType, receiveResource: ResourceType): void {
    withClient((client) => {
      const requestId = client.bankTrade(giveResource, receiveResource);
      setStatusLine(`Bank trade requested (${requestId})`);
      triggerSound("tap");
    });
  }

  function handleEndTurn(): void {
    withClient((client) => {
      const requestId = client.endTurn();
      setStatusLine(`End turn requested (${requestId})`);
      triggerSound("tap");
    });
  }

  return (
    <main className="min-h-screen bg-app px-4 py-6 sm:px-6 sm:py-8">
      <div aria-hidden className="ambient-orb orb-a" />
      <div aria-hidden className="ambient-orb orb-b" />
      <div aria-hidden className="ambient-orb orb-c" />

      <div className="relative z-10 mx-auto w-full max-w-[1380px]">
        <div className="ui-dock panel-glass rounded-2xl px-3 py-2">
          <button
            aria-label={soundEnabled ? "Disable sound effects" : "Enable sound effects"}
            aria-pressed={soundEnabled}
            className={`toggle-pill ${soundEnabled ? "is-on" : ""}`}
            type="button"
            onClick={toggleSound}
          >
            SFX {soundEnabled ? "On" : "Off"}
          </button>
          <span className="stage-chip">Scene: {stageLabel(stage)}</span>
        </div>

        <div aria-live="polite" className="toast-stack">
          {toasts.map((toast) => (
            <p key={toast.id} className={`toast-item toast-${toast.tone}`}>
              {toast.text}
            </p>
          ))}
        </div>

        <div key={stage} className="stage-shell">
          {stage === "home" ? (
            <HomeScreen
              displayName={displayName}
              isBusy={isBusy}
              roomCode={roomCodeInput}
              statusLine={statusLine}
              onCreateRoom={handleCreateRoom}
              onDisplayNameChange={setDisplayName}
              onJoinRoom={handleJoinRoom}
              onRoomCodeChange={(value) => setRoomCodeInput(value.toUpperCase())}
            />
          ) : null}

          {stage === "lobby" && roomState && selfPlayerId ? (
            <LobbyScreen
              isBusy={isBusy}
              lastError={lastError}
              roomState={roomState}
              selfPlayerId={selfPlayerId}
              statusLine={statusLine}
              onLeave={() => {
                void handleLeave();
              }}
              onRequestSync={handleRequestSync}
              onSetReady={handleSetReady}
              onStartGame={handleStartGame}
            />
          ) : null}

          {stage === "game" && roomState && selfPlayerId ? (
            <GameScreen
              eventLines={eventLines}
              lastError={lastError}
              roomState={roomState}
              selfPlayerId={selfPlayerId}
              statusLine={statusLine}
              onBankTrade={handleBankTrade}
              onBuildRoad={handleBuildRoad}
              onBuildSettlement={handleBuildSettlement}
              onEndTurn={handleEndTurn}
              onLeave={() => {
                void handleLeave();
              }}
              onMoveRobber={handleMoveRobber}
              onRequestSync={handleRequestSync}
              onRollDice={handleRollDice}
              onUpgradeCity={handleUpgradeCity}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
