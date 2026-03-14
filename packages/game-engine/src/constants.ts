import type { ResourceMap } from "@hexaforge/shared";

export const INITIAL_BANK_RESOURCES: ResourceMap = {
  timber: 19,
  clay: 19,
  fiber: 19,
  grain: 19,
  alloy: 19
};

export const BUILD_COSTS: Record<"trail" | "outpost" | "stronghold", ResourceMap> = {
  trail: {
    timber: 1,
    clay: 1,
    fiber: 0,
    grain: 0,
    alloy: 0
  },
  outpost: {
    timber: 1,
    clay: 1,
    fiber: 1,
    grain: 1,
    alloy: 0
  },
  stronghold: {
    timber: 0,
    clay: 0,
    fiber: 0,
    grain: 2,
    alloy: 3
  }
};

export const DEFAULT_VICTORY_TARGET = 10;

export const MAX_PROCESSED_REQUESTS = 1024;
