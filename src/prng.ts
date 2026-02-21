export interface PRNG {
  random(): number;
  randomRange(min: number, max: number): number;
}

/** Mulberry32 seeded PRNG — fast, deterministic, no dependencies. */
export function createPRNG(seed: number): PRNG {
  let state = seed | 0;

  function random(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function randomRange(min: number, max: number): number {
    return min + random() * (max - min);
  }

  return { random, randomRange };
}
