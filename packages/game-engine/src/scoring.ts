import type { Building, PlayerId } from "@hexaforge/shared";

export function computeRenown(buildings: Building[], playerId: PlayerId): number {
  let points = 0;

  for (const building of buildings) {
    if (building.ownerId !== playerId) {
      continue;
    }

    points += building.type === "stronghold" ? 2 : 1;
  }

  return points;
}
