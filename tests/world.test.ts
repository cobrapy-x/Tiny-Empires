import { describe, expect, it } from 'vitest';
import { generateWorld, isLand, terrainAt, WORLD_SIZES } from '../src/core/world';
import { Terrain } from '../src/core/types';
import { hashString, mulberryStep, Rng } from '../src/core/rng';

const SEEDS = ['amber-1234', 'tide-42', 'coral-7', 'fjord-99', 'x', 'a much longer seed with spaces', '🌴'];

describe('rng', () => {
  it('is deterministic', () => {
    const a = new Rng(hashString('seed'));
    const b = new Rng(hashString('seed'));
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('stays within [0,1)', () => {
    let s = 123;
    for (let i = 0; i < 10000; i++) {
      const [v, n] = mulberryStep(s);
      s = n;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('world generation', () => {
  it('produces identical worlds for the same seed', () => {
    for (const seed of SEEDS) {
      const a = generateWorld(seed, 64);
      const b = generateWorld(seed, 64);
      expect(Array.from(a.terrain)).toEqual(Array.from(b.terrain));
      expect(Array.from(a.goldOre)).toEqual(Array.from(b.goldOre));
      expect(a.start).toEqual(b.start);
    }
  });

  it('produces different worlds for different seeds', () => {
    const a = generateWorld('one', 64);
    const b = generateWorld('two', 64);
    expect(Array.from(a.terrain)).not.toEqual(Array.from(b.terrain));
  });

  it.each(Object.entries(WORLD_SIZES))('makes a proper island at size %s', (_name, size) => {
    for (const seed of SEEDS) {
      const w = generateWorld(seed, size);
      // Border is deep water
      for (let i = 0; i < size; i++) {
        expect(terrainAt(w, i, 0)).toBe(Terrain.Deep);
        expect(terrainAt(w, 0, i)).toBe(Terrain.Deep);
        expect(terrainAt(w, i, size - 1)).toBe(Terrain.Deep);
        expect(terrainAt(w, size - 1, i)).toBe(Terrain.Deep);
      }
      const counts = new Array(8).fill(0);
      for (const t of w.terrain) counts[t]++;
      const land = counts.reduce((s, c, t) => s + (isLand(t) ? c : 0), 0);
      expect(land / (size * size)).toBeGreaterThan(0.2);
      expect(land / (size * size)).toBeLessThan(0.75);
      for (const t of [Terrain.Beach, Terrain.Grass, Terrain.Forest, Terrain.Mountain, Terrain.Desert]) expect(counts[t]).toBeGreaterThan(0);
    }
  });

  it('starts on grass with forest, mountain and gold within reach', () => {
    for (let i = 0; i < 25; i++) {
      const w = generateWorld(`seed-${i}`, 64);
      const { x, y } = w.start;
      expect(terrainAt(w, x, y)).toBe(Terrain.Grass);
      let forest = 0;
      let mountain = 0;
      for (let dy = -5; dy <= 5; dy++)
        for (let dx = -5; dx <= 5; dx++) {
          const t = terrainAt(w, x + dx, y + dy);
          if (t === Terrain.Forest) forest++;
          if (t === Terrain.Mountain) mountain++;
        }
      expect(forest).toBeGreaterThan(0);
      expect(mountain).toBeGreaterThan(0);
      expect(w.goldOre.reduce((s, v) => s + v, 0)).toBeGreaterThanOrEqual(3);
    }
  });

  it('includes rivers on most islands', () => {
    let withRiver = 0;
    for (let i = 0; i < 20; i++) if (generateWorld(`r${i}`, 64).terrain.includes(Terrain.River)) withRiver++;
    expect(withRiver).toBeGreaterThanOrEqual(15);
  });
});
