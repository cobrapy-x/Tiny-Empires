/**
 * Deterministic random utilities. Everything that affects the simulation must
 * use these helpers (never Math.random) so that a seed + inputs reproduce a game.
 */

/** FNV-1a string hash → unsigned 32-bit integer. */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** One step of mulberry32. Returns [value in 0..1, nextState]. */
export function mulberryStep(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

/** Small stateful RNG, convenient for world generation. */
export class Rng {
  constructor(public state: number) {}

  next(): number {
    const [v, s] = mulberryStep(this.state);
    this.state = s;
    return v;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** Integer hash of 2D coordinates + seed → 0..1. Stateless; used for visual noise. */
export function hash2(x: number, y: number, seed: number): number {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Random alphanumeric seed for new worlds (UI only, not simulation). */
export function randomSeedString(): string {
  const words = ['amber', 'cedar', 'coral', 'dune', 'ember', 'fjord', 'glade', 'harbor', 'isle', 'jade', 'kelp', 'lagoon', 'maple', 'nectar', 'opal', 'pine', 'quartz', 'reef', 'sage', 'tide', 'umber', 'vale', 'willow', 'zephyr'];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${Math.floor(Math.random() * 9000 + 1000)}`;
}
