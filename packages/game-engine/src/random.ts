function hashSeed(seed: string): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function createSeededRng(seed: string): () => number {
  let state = hashSeed(seed) || 1;

  return () => {
    state += 0x6d2b79f5;

    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleDeterministic<TValue>(values: TValue[], seed: string): TValue[] {
  const rng = createSeededRng(seed);
  const clone = [...values];

  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const current = clone[index];
    clone[index] = clone[swapIndex] as TValue;
    clone[swapIndex] = current as TValue;
  }

  return clone;
}
