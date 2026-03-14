import type { Edge, Port, PortType, Tile, TileType, Vertex } from "@hexaforge/shared";

import { shuffleDeterministic } from "./random";

const HEX_RADIUS_TWO_COORDINATES: ReadonlyArray<{ q: number; r: number }> = [
  { q: 0, r: -2 },
  { q: 1, r: -2 },
  { q: 2, r: -2 },
  { q: -1, r: -1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: 2, r: -1 },
  { q: -2, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 2, r: 0 },
  { q: -2, r: 1 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
  { q: 1, r: 1 },
  { q: -2, r: 2 },
  { q: -1, r: 2 },
  { q: 0, r: 2 }
];

const TILE_TYPE_POOL: ReadonlyArray<TileType> = [
  "timberland",
  "timberland",
  "timberland",
  "timberland",
  "claypit",
  "claypit",
  "claypit",
  "fiberfield",
  "fiberfield",
  "fiberfield",
  "fiberfield",
  "grainplain",
  "grainplain",
  "grainplain",
  "grainplain",
  "alloyridge",
  "alloyridge",
  "alloyridge",
  "badlands"
];

const TOKEN_POOL: ReadonlyArray<number> = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

const PORT_TYPE_POOL: ReadonlyArray<PortType> = [
  "three_to_one",
  "three_to_one",
  "three_to_one",
  "three_to_one",
  "timber",
  "clay",
  "fiber",
  "grain",
  "alloy"
];

interface VertexGeometry {
  id: Vertex["id"];
  x: number;
  y: number;
}

interface EdgeWithTiles {
  edge: Edge;
  adjacentTileIds: string[];
}

export interface GeneratedBoard {
  tiles: Tile[];
  vertices: Vertex[];
  edges: Edge[];
  ports: Port[];
}

function axialToCartesian(q: number, r: number): { x: number; y: number } {
  return {
    x: Math.sqrt(3) * (q + r / 2),
    y: 1.5 * r
  };
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function uniquePush(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function assignTiles(seed: string): Tile[] {
  const randomizedTypes = shuffleDeterministic([...TILE_TYPE_POOL], `${seed}:tile-types`);
  const randomizedTokens = shuffleDeterministic([...TOKEN_POOL], `${seed}:tile-tokens`);

  let tokenIndex = 0;

  return HEX_RADIUS_TWO_COORDINATES.map((coordinate, index) => {
    const type = randomizedTypes[index] as TileType;
    const token = type === "badlands" ? null : (randomizedTokens[tokenIndex++] as number);

    return {
      id: `tile-${index}`,
      q: coordinate.q,
      r: coordinate.r,
      type,
      token
    };
  });
}

function findExistingVertexId(
  vertexGeometryById: Map<string, VertexGeometry>,
  x: number,
  y: number,
  epsilon = 1e-9
): string | null {
  for (const geometry of vertexGeometryById.values()) {
    if (Math.abs(geometry.x - x) <= epsilon && Math.abs(geometry.y - y) <= epsilon) {
      return geometry.id;
    }
  }

  return null;
}

function makePorts(seed: string, boundaryEdges: Edge[], vertexGeometryById: Map<string, VertexGeometry>): Port[] {
  const sortedEdges = [...boundaryEdges].sort((leftEdge, rightEdge) => {
    const leftA = vertexGeometryById.get(leftEdge.vertexIds[0]);
    const leftB = vertexGeometryById.get(leftEdge.vertexIds[1]);
    const rightA = vertexGeometryById.get(rightEdge.vertexIds[0]);
    const rightB = vertexGeometryById.get(rightEdge.vertexIds[1]);

    if (!leftA || !leftB || !rightA || !rightB) {
      return 0;
    }

    const leftAngle = Math.atan2((leftA.y + leftB.y) / 2, (leftA.x + leftB.x) / 2);
    const rightAngle = Math.atan2((rightA.y + rightB.y) / 2, (rightA.x + rightB.x) / 2);

    return leftAngle - rightAngle;
  });

  const selectedEdges: Edge[] = [];
  const selectedEdgeIds = new Set<string>();

  for (let index = 0; index < PORT_TYPE_POOL.length; index += 1) {
    let edgeIndex = Math.floor((index * sortedEdges.length) / PORT_TYPE_POOL.length);

    while (selectedEdgeIds.has(sortedEdges[edgeIndex]?.id ?? "") && edgeIndex < sortedEdges.length - 1) {
      edgeIndex += 1;
    }

    const edge = sortedEdges[edgeIndex];

    if (edge && !selectedEdgeIds.has(edge.id)) {
      selectedEdgeIds.add(edge.id);
      selectedEdges.push(edge);
    }
  }

  const shuffledPortTypes = shuffleDeterministic([...PORT_TYPE_POOL], `${seed}:ports`);

  return selectedEdges.map((edge, index) => {
    const type = shuffledPortTypes[index] as PortType;

    return {
      id: `port-${index}`,
      type,
      ratio: type === "three_to_one" ? 3 : 2,
      vertexIds: edge.vertexIds
    };
  });
}

export function generateBoard(seed: string): GeneratedBoard {
  const tiles = assignTiles(seed);

  const vertexById = new Map<string, Vertex>();
  const vertexGeometryById = new Map<string, VertexGeometry>();
  const edgeByKey = new Map<string, Edge>();
  const edgeWithTilesById = new Map<string, EdgeWithTiles>();

  for (const tile of tiles) {
    const center = axialToCartesian(tile.q, tile.r);
    const tileVertexIds: string[] = [];

    for (let cornerIndex = 0; cornerIndex < 6; cornerIndex += 1) {
      const angle = ((60 * cornerIndex - 30) * Math.PI) / 180;
      const x = center.x + Math.cos(angle);
      const y = center.y + Math.sin(angle);

      let vertexId = findExistingVertexId(vertexGeometryById, x, y);

      if (!vertexId) {
        vertexId = `vertex-${vertexById.size}`;

        const createdVertex: Vertex = {
          id: vertexId,
          x,
          y,
          adjacentTileIds: [],
          adjacentEdgeIds: []
        };

        vertexById.set(vertexId, createdVertex);
        vertexGeometryById.set(vertexId, {
          id: vertexId,
          x,
          y
        });
      }

      const vertex = vertexById.get(vertexId);

      if (!vertex) {
        throw new Error("Vertex expected during board generation");
      }

      uniquePush(vertex.adjacentTileIds, tile.id);
      tileVertexIds.push(vertexId);
    }

    for (let edgeIndex = 0; edgeIndex < tileVertexIds.length; edgeIndex += 1) {
      const leftVertexId = tileVertexIds[edgeIndex] as string;
      const rightVertexId = tileVertexIds[(edgeIndex + 1) % tileVertexIds.length] as string;
      const key = pairKey(leftVertexId, rightVertexId);

      if (!edgeByKey.has(key)) {
        const edge: Edge = {
          id: `edge-${edgeByKey.size}`,
          vertexIds: [leftVertexId, rightVertexId]
        };

        edgeByKey.set(key, edge);
        edgeWithTilesById.set(edge.id, {
          edge,
          adjacentTileIds: []
        });
      }

      const edge = edgeByKey.get(key);
      const edgeWithTiles = edge ? edgeWithTilesById.get(edge.id) : undefined;

      if (!edge || !edgeWithTiles) {
        throw new Error("Edge expected during board generation");
      }

      uniquePush(edgeWithTiles.adjacentTileIds, tile.id);

      const leftVertex = vertexById.get(leftVertexId);
      const rightVertex = vertexById.get(rightVertexId);

      if (!leftVertex || !rightVertex) {
        throw new Error("Vertices expected while linking edges");
      }

      uniquePush(leftVertex.adjacentEdgeIds, edge.id);
      uniquePush(rightVertex.adjacentEdgeIds, edge.id);
    }
  }

  const vertices = [...vertexById.values()].sort((left, right) =>
    left.id.localeCompare(right.id, undefined, { numeric: true })
  );
  const edges = [...edgeByKey.values()].sort((left, right) =>
    left.id.localeCompare(right.id, undefined, { numeric: true })
  );

  const boundaryEdges = [...edgeWithTilesById.values()]
    .filter((edgeWithTiles) => edgeWithTiles.adjacentTileIds.length === 1)
    .map((edgeWithTiles) => edgeWithTiles.edge);

  const ports = makePorts(seed, boundaryEdges, vertexGeometryById);

  return {
    tiles,
    vertices,
    edges,
    ports
  };
}
