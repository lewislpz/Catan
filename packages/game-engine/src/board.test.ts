import { describe, expect, it } from "vitest";

import { generateBoard } from "./board";

describe("board generation", () => {
  it("is deterministic for the same seed", () => {
    const first = generateBoard("board-seed-1");
    const second = generateBoard("board-seed-1");

    expect(first).toEqual(second);
  });

  it("builds expected topology for radius-2 board", () => {
    const board = generateBoard("board-seed-2");

    expect(board.tiles).toHaveLength(19);
    expect(board.vertices).toHaveLength(54);
    expect(board.edges).toHaveLength(72);
    expect(board.ports).toHaveLength(9);

    const badlandsTiles = board.tiles.filter((tile) => tile.type === "badlands");
    expect(badlandsTiles).toHaveLength(1);
    expect(badlandsTiles[0]?.token).toBeNull();

    const productiveTiles = board.tiles.filter((tile) => tile.type !== "badlands");
    expect(productiveTiles.every((tile) => tile.token !== null)).toBe(true);
  });
});
