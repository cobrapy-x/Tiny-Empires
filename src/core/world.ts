import { fbm } from './noise';
import { hashString, Rng } from './rng';
import { Terrain, type World } from './types';

export const WORLD_SIZES = { small: 48, medium: 64, large: 80 } as const;
export type WorldSizeName = keyof typeof WORLD_SIZES;

const N8 = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
] as const;
const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

export const isWater = (t: Terrain): boolean => t === Terrain.Deep || t === Terrain.Shallow;
export const isLand = (t: Terrain): boolean => !isWater(t);

export function inBounds(world: { size: number }, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < world.size && y < world.size;
}

export function terrainAt(world: World, x: number, y: number): Terrain {
  if (!inBounds(world, x, y)) return Terrain.Deep;
  return world.terrain[y * world.size + x] as Terrain;
}

/** Count 8-neighbours matching a predicate. */
export function countNeighbours(world: World, x: number, y: number, pred: (t: Terrain) => boolean): number {
  let n = 0;
  for (const [dx, dy] of N8) if (pred(terrainAt(world, x + dx, y + dy))) n++;
  return n;
}

/**
 * Generate a deterministic island from a seed. The same seed and size always
 * produce an identical world, so saves only need to store the seed.
 */
export function generateWorld(seed: string, size: number = WORLD_SIZES.medium): World {
  const base = hashString(seed);
  const rng = new Rng(base ^ 0x9e3779b9);
  const total = size * size;
  const elevation = new Float32Array(total);
  const moisture = new Float32Array(total);
  const terrain = new Uint8Array(total);
  const goldOre = new Uint8Array(total);
  const c = (size - 1) / 2;
  const scale = 6 / size;

  // Elevation: fractal noise shaped by a radial island mask.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - c) / c;
      const ny = (y - c) / c;
      const d = Math.min(1, Math.sqrt(nx * nx + ny * ny) * 0.85 + Math.max(Math.abs(nx), Math.abs(ny)) * 0.25);
      const n = fbm(x * scale, y * scale, base, 5, 0.5);
      const ridge = fbm(x * scale * 1.7 + 50, y * scale * 1.7 + 50, base + 7, 3, 0.5);
      let e = n * 0.75 + ridge * 0.35 - d * d * 0.8 + 0.1;
      if (d > 0.93) e = Math.min(e, -0.3);
      elevation[y * size + x] = e;
      moisture[y * size + x] = fbm(x * scale * 1.3 + 200, y * scale * 1.3 + 200, base + 99, 3, 0.55);
    }
  }

  // Classify land by percentiles so every island gets a healthy mix of biomes.
  const seaLevel = 0.2;
  const land: number[] = [];
  for (let i = 0; i < total; i++) if (elevation[i] >= seaLevel) land.push(i);
  const byE = [...land].sort((a, b) => elevation[a] - elevation[b]);
  const byM = [...land].sort((a, b) => moisture[a] - moisture[b]);
  const mountainLevel = byE.length ? elevation[byE[Math.floor(byE.length * 0.86)]] : Infinity;
  const dryLevel = byM.length ? moisture[byM[Math.floor(byM.length * 0.17)]] : 0;
  const wetLevel = byM.length ? moisture[byM[Math.floor(byM.length * 0.66)]] : 1;

  for (let i = 0; i < total; i++) {
    const e = elevation[i];
    const m = moisture[i];
    if (e < seaLevel - 0.12) terrain[i] = Terrain.Deep;
    else if (e < seaLevel) terrain[i] = Terrain.Shallow;
    else if (e > mountainLevel) terrain[i] = Terrain.Mountain;
    else if (m < dryLevel) terrain[i] = Terrain.Desert;
    else if (m > wetLevel) terrain[i] = Terrain.Forest;
    else terrain[i] = Terrain.Grass;
  }

  const world: World = { seed, size, terrain, elevation, goldOre, start: { x: 0, y: 0 } };

  // Coastlines: land touching water becomes beach (except mountains).
  const beach: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = terrain[y * size + x] as Terrain;
      if (isLand(t) && t !== Terrain.Mountain) {
        let wet = false;
        for (const [dx, dy] of N4) if (isWater(terrainAt(world, x + dx, y + dy))) wet = true;
        if (wet) beach.push(y * size + x);
      }
    }
  }
  for (const i of beach) terrain[i] = Terrain.Beach;

  carveRivers(world, rng, seaLevel);
  placeGold(world, rng);
  world.start = chooseStart(world, rng);
  return world;
}

function carveRivers(world: World, rng: Rng, seaLevel: number): void {
  const { size, terrain, elevation } = world;
  const sources: number[] = [];
  for (let i = 0; i < size * size; i++) {
    if (terrain[i] === Terrain.Mountain || (elevation[i] > seaLevel + 0.25 && terrain[i] !== Terrain.Beach)) sources.push(i);
  }
  const riverCount = Math.min(sources.length, 2 + rng.int(0, 2));
  for (let r = 0; r < riverCount; r++) {
    let idx = rng.pick(sources);
    const visited = new Set<number>();
    for (let step = 0; step < size * 2; step++) {
      visited.add(idx);
      const x = idx % size;
      const y = Math.floor(idx / size);
      const t = terrain[idx] as Terrain;
      if (isWater(t)) break;
      if (t !== Terrain.Mountain) terrain[idx] = Terrain.River;
      // Flow to the lowest unvisited 4-neighbour (slight randomness for meanders).
      let best = -1;
      let bestE = Infinity;
      for (const [dx, dy] of N4) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(world, nx, ny)) continue;
        const ni = ny * size + nx;
        if (visited.has(ni)) continue;
        const e = elevation[ni] + rng.next() * 0.03;
        if (e < bestE) {
          bestE = e;
          best = ni;
        }
      }
      if (best < 0) break;
      idx = best;
    }
  }
}

function placeGold(world: World, rng: Rng): void {
  const { size, terrain, goldOre } = world;
  const candidates: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (terrain[i] !== Terrain.Mountain) continue;
      const accessible = countNeighbours(world, x, y, (t) => isLand(t) && t !== Terrain.Mountain) > 0;
      if (accessible) candidates.push(i);
    }
  }
  const target = Math.max(3, Math.round(candidates.length * 0.12));
  for (let k = 0; k < target && candidates.length > 0; k++) {
    const j = rng.int(0, candidates.length - 1);
    goldOre[candidates[j]] = 1;
    candidates.splice(j, 1);
  }
}

/** Distance (Chebyshev) to the nearest tile matching pred, up to maxR (returns maxR+1 if none). */
function nearest(world: World, x: number, y: number, maxR: number, pred: (t: Terrain, i: number) => boolean): number {
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(world, nx, ny)) continue;
        const i = ny * world.size + nx;
        if (pred(world.terrain[i] as Terrain, i)) return r;
      }
    }
  }
  return maxR + 1;
}

/**
 * Pick a fair starting tile: grassland near forest, mountains and fresh water.
 * Guarantees the essentials exist nearby so a new game can never deadlock.
 */
function chooseStart(world: World, rng: Rng): { x: number; y: number } {
  const { size, terrain } = world;
  const c = size / 2;
  let best = { x: Math.floor(c), y: Math.floor(c) };
  let bestScore = -Infinity;
  for (let y = 4; y < size - 4; y++) {
    for (let x = 4; x < size - 4; x++) {
      if (terrain[y * size + x] !== Terrain.Grass) continue;
      const dF = nearest(world, x, y, 6, (t) => t === Terrain.Forest);
      const dM = nearest(world, x, y, 7, (t) => t === Terrain.Mountain);
      const dW = nearest(world, x, y, 6, (t) => t === Terrain.River || t === Terrain.Shallow);
      let grass = 0;
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) if (terrainAt(world, x + dx, y + dy) === Terrain.Grass) grass++;
      const centre = Math.hypot(x - c, y - c) / size;
      const score = grass * 1.2 - dF * 3 - dM * 2.5 - dW * 1.5 - centre * 20 + rng.next() * 2;
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  const { x, y } = best;
  // Make sure the town hall tile is grass and the essentials are in reach.
  world.terrain[y * size + x] = Terrain.Grass;
  ensureNearby(world, x, y, Terrain.Forest, 5, 4, rng);
  ensureNearby(world, x, y, Terrain.Mountain, 6, 3, rng);
  return best;
}

function ensureNearby(world: World, x: number, y: number, kind: Terrain, radius: number, count: number, rng: Rng): void {
  let have = 0;
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) if (terrainAt(world, x + dx, y + dy) === kind) have++;
  if (have >= count) return;
  // Grow a small cluster on grass/desert at distance 3..radius.
  for (let attempt = 0; attempt < 60 && have < count; attempt++) {
    const dx = rng.int(-radius, radius);
    const dy = rng.int(-radius, radius);
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 3) continue;
    const cx = x + dx;
    const cy = y + dy;
    for (const [ox, oy] of [[0, 0], ...N4]) {
      const tx = cx + ox;
      const ty = cy + oy;
      if (!inBounds(world, tx, ty) || Math.max(Math.abs(tx - x), Math.abs(ty - y)) < 2) continue;
      const i = ty * world.size + tx;
      const t = world.terrain[i] as Terrain;
      if (t === Terrain.Grass || t === Terrain.Desert) {
        world.terrain[i] = kind;
        have++;
      }
    }
  }
}
