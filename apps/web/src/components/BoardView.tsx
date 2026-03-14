import type { Building, Edge, GameState, PlayerId, Road, Tile, Vertex } from "@hexaforge/shared";
import React, { useEffect, useMemo, useState } from "react";

import type { InteractionMode, LegalPlacements } from "../lib/game-view-model";

interface BoardViewProps {
  cameraCueTick: number;
  diceCueTick: number;
  game: GameState;
  isMyTurn: boolean;
  interactionMode: InteractionMode;
  legalPlacements: LegalPlacements;
  onEdgeSelect: (edgeId: string) => void;
  onVertexSelect: (vertexId: string) => void;
  onTileSelect: (tileId: string) => void;
}

interface Point {
  x: number;
  y: number;
}

const SCALE = 42;
const PADDING = 72;

const PLAYER_COLOR_BY_NAME: Record<string, string> = {
  amber: "#c2410c",
  teal: "#0f766e",
  slate: "#334155",
  rose: "#be123c"
};

const TILE_COLOR_BY_TYPE: Record<Tile["type"], string> = {
  timberland: "#0f766e",
  claypit: "#0ea5e9",
  fiberfield: "#2563eb",
  grainplain: "#0891b2",
  alloyridge: "#1d4ed8",
  badlands: "#3b82f6"
};

const TILE_DARK_BY_TYPE: Record<Tile["type"], string> = {
  timberland: "#0b5551",
  claypit: "#0b6f9e",
  fiberfield: "#1e40af",
  grainplain: "#0f6374",
  alloyridge: "#1e3a8a",
  badlands: "#1d4ed8"
};

const TILE_GLOW_BY_TYPE: Record<Tile["type"], string> = {
  timberland: "rgba(20, 184, 166, 0.45)",
  claypit: "rgba(14, 165, 233, 0.45)",
  fiberfield: "rgba(37, 99, 235, 0.4)",
  grainplain: "rgba(6, 182, 212, 0.45)",
  alloyridge: "rgba(59, 130, 246, 0.4)",
  badlands: "rgba(96, 165, 250, 0.42)"
};

function axialToCartesian(q: number, r: number): Point {
  return {
    x: Math.sqrt(3) * (q + r / 2),
    y: 1.5 * r
  };
}

function toScreen(value: number, min: number): number {
  return (value - min) * SCALE + PADDING;
}

function getOwnerColor(game: GameState, ownerId: PlayerId): string {
  const player = game.players.find((entry) => entry.id === ownerId);

  if (!player) {
    return "#0f172a";
  }

  return PLAYER_COLOR_BY_NAME[player.color] ?? "#0f172a";
}

function onKeySelect(event: React.KeyboardEvent<SVGElement>, run: () => void): void {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  run();
}

function buildAssistLine(
  interactionMode: InteractionMode,
  isMyTurn: boolean,
  phase: GameState["turn"]["phase"]
): string {
  if (!isMyTurn) {
    return "Observing. Wait for your turn and plan your expansion.";
  }

  if (phase === "roll") {
    return "Roll the dice to trigger sector production.";
  }

  if (phase === "resolve_raider") {
    return "Relocate the raider onto a highlighted tile.";
  }

  if (phase === "finished") {
    return "Match finished. Review the final board state.";
  }

  switch (interactionMode) {
    case "road":
      return "Click glowing edges to deploy a legal route.";
    case "settlement":
      return "Click highlighted vertices to place a legal outpost.";
    case "city":
      return "Select one of your valid outposts to upgrade.";
    case "robber":
      return "Choose a highlighted tile to reposition the raider.";
    default:
      return "Choose an action, then use highlighted board slots.";
  }
}

export function BoardView({
  cameraCueTick,
  diceCueTick,
  game,
  isMyTurn,
  interactionMode,
  legalPlacements,
  onEdgeSelect,
  onVertexSelect,
  onTileSelect
}: BoardViewProps) {
  const [tiltState, setTiltState] = useState({
    rotateX: 0,
    rotateY: 0,
    glowX: 50,
    glowY: 50
  });
  const [cameraBoostActive, setCameraBoostActive] = useState(false);
  const [diceShockActive, setDiceShockActive] = useState(false);

  useEffect(() => {
    if (cameraCueTick <= 0) {
      return;
    }

    setCameraBoostActive(true);
    const timeoutId = window.setTimeout(() => {
      setCameraBoostActive(false);
    }, 760);

    return () => window.clearTimeout(timeoutId);
  }, [cameraCueTick]);

  useEffect(() => {
    if (diceCueTick <= 0) {
      return;
    }

    setDiceShockActive(true);
    const timeoutId = window.setTimeout(() => {
      setDiceShockActive(false);
    }, 960);

    return () => window.clearTimeout(timeoutId);
  }, [diceCueTick]);

  const vertexById = useMemo(
    () => new Map(game.board.vertices.map((vertex) => [vertex.id, vertex])),
    [game.board.vertices]
  );

  const roadByEdgeId = useMemo(() => new Map(game.roads.map((road) => [road.edgeId, road])), [game.roads]);
  const buildingByVertexId = useMemo(
    () => new Map(game.buildings.map((building) => [building.vertexId, building])),
    [game.buildings]
  );

  const viewport = useMemo(() => {
    const tileCenters = game.board.tiles.map((tile) => axialToCartesian(tile.q, tile.r));
    const xs = [...game.board.vertices.map((vertex) => vertex.x), ...tileCenters.map((center) => center.x)];
    const ys = [...game.board.vertices.map((vertex) => vertex.y), ...tileCenters.map((center) => center.y)];

    const minX = Math.min(...xs) - 1.6;
    const maxX = Math.max(...xs) + 1.6;
    const minY = Math.min(...ys) - 1.6;
    const maxY = Math.max(...ys) + 1.6;

    return {
      minX,
      minY,
      width: (maxX - minX) * SCALE + PADDING * 2,
      height: (maxY - minY) * SCALE + PADDING * 2
    };
  }, [game.board.tiles, game.board.vertices]);

  function tilePolygon(tile: Tile): string {
    const center = axialToCartesian(tile.q, tile.r);
    const points: string[] = [];

    for (let cornerIndex = 0; cornerIndex < 6; cornerIndex += 1) {
      const angle = ((60 * cornerIndex - 30) * Math.PI) / 180;
      const rawX = center.x + Math.cos(angle);
      const rawY = center.y + Math.sin(angle);

      points.push(`${toScreen(rawX, viewport.minX)},${toScreen(rawY, viewport.minY)}`);
    }

    return points.join(" ");
  }

  function toVertexPoint(vertex: Vertex): Point {
    return {
      x: toScreen(vertex.x, viewport.minX),
      y: toScreen(vertex.y, viewport.minY)
    };
  }

  function edgePoints(edge: Edge): [Point, Point] {
    const leftVertex = vertexById.get(edge.vertexIds[0]);
    const rightVertex = vertexById.get(edge.vertexIds[1]);

    if (!leftVertex || !rightVertex) {
      throw new Error(`Missing edge vertices for ${edge.id}`);
    }

    return [toVertexPoint(leftVertex), toVertexPoint(rightVertex)];
  }

  function drawBuilding(building: Building): React.ReactNode {
    const vertex = vertexById.get(building.vertexId);

    if (!vertex) {
      return null;
    }

    const point = toVertexPoint(vertex);
    const color = getOwnerColor(game, building.ownerId);

    if (building.type === "stronghold") {
      return (
        <rect
          key={`building-${building.id}`}
          className="building-node"
          fill={color}
          height={17}
          rx={2}
          stroke="#020617"
          strokeWidth={1.5}
          width={17}
          x={point.x - 8.5}
          y={point.y - 8.5}
        />
      );
    }

    return (
      <circle
        key={`building-${building.id}`}
        className="building-node"
        cx={point.x}
        cy={point.y}
        fill={color}
        r={7}
        stroke="#020617"
        strokeWidth={1.5}
      />
    );
  }

  function drawRoad(road: Road): React.ReactNode {
    const edge = game.board.edges.find((entry) => entry.id === road.edgeId);

    if (!edge) {
      return null;
    }

    const [start, end] = edgePoints(edge);

    return (
      <g key={`road-${road.id}`}>
        <line
          className="road-energy"
          filter="url(#road-neon)"
          stroke={getOwnerColor(game, road.ownerId)}
          strokeLinecap="round"
          strokeOpacity={0.52}
          strokeWidth={10}
          x1={start.x}
          x2={end.x}
          y1={start.y}
          y2={end.y}
        />
        <line
          stroke={getOwnerColor(game, road.ownerId)}
          strokeLinecap="round"
          strokeWidth={7}
          x1={start.x}
          x2={end.x}
          y1={start.y}
          y2={end.y}
        />
      </g>
    );
  }

  function onBoardPointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const rect = event.currentTarget.getBoundingClientRect();

    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    const normalizedX = (event.clientX - rect.left) / rect.width;
    const normalizedY = (event.clientY - rect.top) / rect.height;
    const clampedX = Math.min(1, Math.max(0, normalizedX));
    const clampedY = Math.min(1, Math.max(0, normalizedY));

    setTiltState({
      rotateX: (0.5 - clampedY) * 14,
      rotateY: (clampedX - 0.5) * 18,
      glowX: clampedX * 100,
      glowY: clampedY * 100
    });
  }

  function onBoardPointerLeave(): void {
    setTiltState((current) => {
      if (current.rotateX === 0 && current.rotateY === 0 && current.glowX === 50 && current.glowY === 50) {
        return current;
      }

      return {
        rotateX: 0,
        rotateY: 0,
        glowX: 50,
        glowY: 50
      };
    });
  }

  const boardLayerStyle: React.CSSProperties = {
    transform: `translate3d(${tiltState.rotateY * 0.38}px, ${-tiltState.rotateX * 0.38}px, ${cameraBoostActive ? 16 : 9}px) rotateX(${tiltState.rotateX}deg) rotateY(${tiltState.rotateY}deg) ${
      diceShockActive ? "scale(1.016)" : "scale(1)"
    }`
  };

  const boardShellStyle = {
    "--glow-x": `${tiltState.glowX}%`,
    "--glow-y": `${tiltState.glowY}%`
  } as React.CSSProperties;

  const assistLine = buildAssistLine(interactionMode, isMyTurn, game.turn.phase);
  const legalRoadCount = legalPlacements.roadEdgeIds.size;
  const legalSettlementCount = legalPlacements.settlementVertexIds.size;
  const legalCityCount = legalPlacements.cityVertexIds.size;
  const legalRobberCount = legalPlacements.robberTileIds.size;

  return (
    <div
      className={`board-shell overflow-hidden ${
        cameraBoostActive ? "board-cinematic-boost" : ""
      } ${diceShockActive ? "board-dice-shock" : ""} ${isMyTurn ? "board-my-turn" : ""} phase-${game.turn.phase} mode-${interactionMode ?? "idle"}`}
      style={boardShellStyle}
      onPointerLeave={onBoardPointerLeave}
      onPointerMove={onBoardPointerMove}
    >
      <div aria-hidden className="board-starfield" />
      <div aria-hidden className="board-aurora" />
      <div aria-hidden className="board-hud-lines" />
      <div aria-hidden className="board-hud-corners" />
      <div aria-hidden className={`board-dice-burst ${diceShockActive ? "is-active" : ""}`} />
      <aside className="board-assist-panel" role="status">
        <p className="board-assist-title">Tactical Guide</p>
        <p className="board-assist-line">{assistLine}</p>
        <p className="board-assist-meta">
          Roads {legalRoadCount} · Outposts {legalSettlementCount} · Upgrades {legalCityCount} · Raider {legalRobberCount}
        </p>
      </aside>

      <div className="board-tilt-layer" style={boardLayerStyle}>
        <svg
          aria-label="Hex board"
          className="board-svg board-svg-cinematic h-auto w-full"
          role="img"
          viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        >
          <defs>
            <filter id="tile-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="3" stdDeviation="2.8" floodColor="rgba(15,23,42,0.45)" />
            </filter>
            <filter id="tile-neon" x="-45%" y="-45%" width="190%" height="190%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="rgba(56,189,248,0.7)" />
            </filter>
            <filter id="road-neon" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.8" floodColor="rgba(56,189,248,0.85)" />
            </filter>
            <pattern id="holo-grid" width="34" height="34" patternUnits="userSpaceOnUse">
              <path d="M 34 0 L 0 0 0 34" fill="none" stroke="rgba(125, 211, 252, 0.16)" strokeWidth="1" />
            </pattern>
            <linearGradient id="tile-glare" x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(224,242,254,0.5)" />
              <stop offset="38%" stopColor="rgba(224,242,254,0.14)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
            <radialGradient id="board-vignette" cx="50%" cy="50%" r="60%">
              <stop offset="55%" stopColor="rgba(15, 23, 42, 0)" />
              <stop offset="100%" stopColor="rgba(15, 23, 42, 0.52)" />
            </radialGradient>
          </defs>

          <rect fill="#020617" height={viewport.height} width={viewport.width} x={0} y={0} />
          <rect className="board-grid-layer" fill="url(#holo-grid)" height={viewport.height} width={viewport.width} x={0} y={0} />
          <rect fill="url(#board-vignette)" height={viewport.height} width={viewport.width} x={0} y={0} />

          {game.board.tiles.map((tile, index) => {
            const center = axialToCartesian(tile.q, tile.r);
            const centerX = toScreen(center.x, viewport.minX);
            const centerY = toScreen(center.y, viewport.minY);
            const isRobberTile = game.robber.tileId === tile.id;
            const canMoveRobber = interactionMode === "robber" && legalPlacements.robberTileIds.has(tile.id);
            const tilePoints = tilePolygon(tile);

            return (
              <g key={tile.id}>
                {[14, 11, 8, 5].map((depthOffset, depthIndex) => (
                  <polygon
                    key={`${tile.id}-depth-${depthOffset}`}
                    className="tile-depth"
                    fill={TILE_DARK_BY_TYPE[tile.type]}
                    fillOpacity={0.26 + depthIndex * 0.17}
                    points={tilePoints}
                    stroke="rgba(2,6,23,0.58)"
                    strokeWidth={1.2}
                    transform={`translate(0 ${depthOffset})`}
                  />
                ))}
                <polygon
                  className="tile-shape"
                  fill={TILE_COLOR_BY_TYPE[tile.type]}
                  fillOpacity={0.88}
                  filter="url(#tile-shadow)"
                  points={tilePoints}
                  stroke={canMoveRobber ? "#fbbf24" : "#0ea5e9"}
                  strokeDasharray={canMoveRobber ? "8 6" : undefined}
                  strokeWidth={canMoveRobber ? 3 : 2}
                  style={{ animationDelay: `${index * 30}ms` }}
                />
                <polygon
                  className="tile-wire"
                  fill="none"
                  filter="url(#tile-neon)"
                  points={tilePoints}
                  stroke={TILE_GLOW_BY_TYPE[tile.type]}
                  strokeWidth={1.25}
                />
                <polygon className="tile-glare" fill="url(#tile-glare)" points={tilePoints} />

                {canMoveRobber ? (
                  <polygon
                    aria-label={`Move raider to ${tile.id}`}
                    fill="transparent"
                    points={tilePoints}
                    role="button"
                    stroke="transparent"
                    strokeWidth={24}
                    tabIndex={0}
                    onClick={() => onTileSelect(tile.id)}
                    onKeyDown={(event) => onKeySelect(event, () => onTileSelect(tile.id))}
                  />
                ) : null}

                {tile.token ? (
                  <g className="token-chip" style={{ animationDelay: `${index * 40 + 150}ms` }}>
                    <circle className="token-ring" cx={centerX} cy={centerY} fill="rgba(56,189,248,0.1)" r={18} />
                    <circle cx={centerX} cy={centerY} fill="#e2e8f0" r={14} stroke="#0f172a" strokeWidth={1.5} />
                    <text
                      dominantBaseline="middle"
                      fill="#020617"
                      fontFamily="var(--font-mono), monospace"
                      fontSize="12"
                      fontWeight={700}
                      textAnchor="middle"
                      x={centerX}
                      y={centerY}
                    >
                      {tile.token}
                    </text>
                  </g>
                ) : null}

                {isRobberTile ? (
                  <g className="raider-marker">
                    <circle className="raider-pulse" cx={centerX} cy={centerY - 21} fill="none" r={15} />
                    <circle cx={centerX} cy={centerY - 21} fill="#020617" r={11} />
                    <text
                      dominantBaseline="middle"
                      fill="#bae6fd"
                      fontFamily="var(--font-mono), monospace"
                      fontSize="11"
                      fontWeight={700}
                      textAnchor="middle"
                      x={centerX}
                      y={centerY - 21}
                    >
                      R
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}

          {game.board.edges.map((edge) => {
            const [start, end] = edgePoints(edge);
            const hasRoad = roadByEdgeId.has(edge.id);
            const isLegal = legalPlacements.roadEdgeIds.has(edge.id);
            const canBuild = interactionMode === "road" && isLegal && !hasRoad;

            return (
              <g key={`edge-${edge.id}`}>
                <line
                  stroke={hasRoad ? "transparent" : "#94a3b8"}
                  strokeLinecap="round"
                  strokeWidth={3}
                  x1={start.x}
                  x2={end.x}
                  y1={start.y}
                  y2={end.y}
                />

                {canBuild ? (
                  <>
                    <line
                      className="legal-edge"
                      stroke="#f59e0b"
                      strokeDasharray="5 4"
                      strokeLinecap="round"
                      strokeWidth={5}
                      x1={start.x}
                      x2={end.x}
                      y1={start.y}
                      y2={end.y}
                    />
                    <line
                      aria-label={`Build road on ${edge.id}`}
                      role="button"
                      stroke="transparent"
                      strokeLinecap="round"
                      strokeWidth={20}
                      tabIndex={0}
                      x1={start.x}
                      x2={end.x}
                      y1={start.y}
                      y2={end.y}
                      onClick={() => onEdgeSelect(edge.id)}
                      onKeyDown={(event) => onKeySelect(event, () => onEdgeSelect(edge.id))}
                    />
                  </>
                ) : null}
              </g>
            );
          })}

          {game.roads.map((road) => drawRoad(road))}
          {game.buildings.map((building) => drawBuilding(building))}

          {game.board.vertices.map((vertex) => {
            const point = toVertexPoint(vertex);
            const hasBuilding = buildingByVertexId.has(vertex.id);
            const canBuildSettlement =
              interactionMode === "settlement" && legalPlacements.settlementVertexIds.has(vertex.id) && !hasBuilding;
            const canUpgradeCity = interactionMode === "city" && legalPlacements.cityVertexIds.has(vertex.id) && hasBuilding;

            if (!canBuildSettlement && !canUpgradeCity) {
              return null;
            }

            return (
              <circle
                key={`vertex-hotspot-${vertex.id}`}
                aria-label={canUpgradeCity ? `Upgrade city at ${vertex.id}` : `Build settlement at ${vertex.id}`}
                className="legal-vertex"
                cx={point.x}
                cy={point.y}
                fill="none"
                r={canUpgradeCity ? 11 : 9}
                role="button"
                stroke={canUpgradeCity ? "#2563eb" : "#f59e0b"}
                strokeDasharray={canUpgradeCity ? "2 2" : "3 2"}
                strokeWidth={3}
                tabIndex={0}
                onClick={() => onVertexSelect(vertex.id)}
                onKeyDown={(event) => onKeySelect(event, () => onVertexSelect(vertex.id))}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
