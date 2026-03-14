import { describe, expect, it } from "vitest";

import { generateRoomCode } from "./roomCode";

describe("generateRoomCode", () => {
  it("returns a 6-char room code", () => {
    const code = generateRoomCode();

    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
  });
});
