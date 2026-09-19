/**
 * RNG deterministico (mulberry32). Cada partida recebe uma seed, o que permite
 * reproduzir uma rodada para debug e mantem hazards/fuses coerentes.
 */
export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: T[]): T[];
  chance(probability: number): boolean;
  sign(): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0 || 0x2f6e2b1;

  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const range = (min: number, max: number): number => min + next() * (max - min);
  const int = (min: number, max: number): number => Math.floor(range(min, max + 1));

  return {
    next,
    range,
    int,
    pick: <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    shuffle: <T,>(items: T[]): T[] => {
      for (let i = items.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const tmp = items[i];
        items[i] = items[j];
        items[j] = tmp;
      }
      return items;
    },
    chance: (probability: number): boolean => next() < probability,
    sign: (): number => (next() < 0.5 ? -1 : 1),
  };
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
