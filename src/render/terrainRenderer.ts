/**
 * Renders the whole island into one canvas at 16 px per tile.
 * Biome borders are jittered with noise for organic, hand-painted transitions,
 * then trees, peaks and other decorations are stamped on top.
 */
import { valueNoise } from '../core/noise';
import { hash2, hashString } from '../core/rng';
import { Terrain, type World } from '../core/types';
import { isWater, terrainAt } from '../core/world';
import { PAL } from './palette';
import { drawCactus, drawPeak, drawTree, makeCanvas, TILE } from './sprites';

type RGB = readonly [number, number, number];

function mix(a: RGB, b: RGB, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Tile-level distance from land, used to shade water depth. */
function waterDistance(world: World): Float32Array {
  const { size } = world;
  const dist = new Float32Array(size * size).fill(99);
  const queue: number[] = [];
  for (let i = 0; i < size * size; i++) {
    if (!isWater(world.terrain[i] as Terrain)) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % size;
    const y = Math.floor(i / size);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const ni = ny * size + nx;
      if (dist[ni] > dist[i] + 1) {
        dist[ni] = dist[i] + 1;
        queue.push(ni);
      }
    }
  }
  return dist;
}

function sampleDist(dist: Float32Array, size: number, fx: number, fy: number): number {
  const x0 = Math.max(0, Math.min(size - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(size - 1, Math.floor(fy)));
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = Math.max(0, Math.min(1, fx - x0));
  const ty = Math.max(0, Math.min(1, fy - y0));
  const a = dist[y0 * size + x0] + (dist[y0 * size + x1] - dist[y0 * size + x0]) * tx;
  const b = dist[y1 * size + x0] + (dist[y1 * size + x1] - dist[y1 * size + x0]) * tx;
  return a + (b - a) * ty;
}

export function renderTerrain(world: World): HTMLCanvasElement {
  const { size } = world;
  const W = size * TILE;
  const [canvas, g] = makeCanvas(W, W);
  const img = g.createImageData(W, W);
  const data = img.data;
  const seed = hashString(world.seed);
  const wdist = waterDistance(world);

  const sample = (px: number, py: number): Terrain => terrainAt(world, Math.floor(px / TILE), Math.floor(py / TILE));

  for (let py = 0; py < W; py++) {
    for (let px = 0; px < W; px++) {
      const jx = Math.round((valueNoise(px / 7, py / 7, seed) - 0.5) * 7);
      const jy = Math.round((valueNoise(px / 7 + 31, py / 7 + 17, seed) - 0.5) * 7);
      const sx = px + jx;
      const sy = py + jy;
      let t = sample(sx, sy);
      const own = sample(px, py);
      // Rivers keep crisp-ish banks so they read clearly.
      if (own === Terrain.River) t = valueNoise(px / 3, py / 3, seed + 5) > 0.15 ? Terrain.River : t;
      const n = hash2(px, py, seed);
      const n2 = valueNoise(px / 5, py / 5, seed + 11);
      let col: [number, number, number];
      switch (t) {
        case Terrain.Deep:
        case Terrain.Shallow: {
          const d = sampleDist(wdist, size, sx / TILE - 0.5, sy / TILE - 0.5);
          const depth = Math.min(1, (d - 1 + n2 * 0.8) / 4);
          col = mix(mix(PAL.shallow2, PAL.shallow, n2), mix(PAL.deep, PAL.deep2, n2), depth);
          // Foam along the shore.
          if (d <= 1.2 && !isWater(sample(sx + 3, sy)) ) col = mix(col, PAL.foam, 0.55);
          else if (d <= 1.2 && (!isWater(sample(sx - 3, sy)) || !isWater(sample(sx, sy + 3)) || !isWater(sample(sx, sy - 3)))) col = mix(col, PAL.foam, 0.4);
          // Gentle wave lines.
          if (Math.sin((px + py * 0.6) * 0.35 + n2 * 6) > 0.96) col = mix(col, PAL.foam, 0.25);
          break;
        }
        case Terrain.Beach:
          col = mix(PAL.beach, PAL.beach2, n > 0.7 ? 1 : n2 * 0.6);
          break;
        case Terrain.Grass:
          col = n > 0.92 ? [...PAL.grass3] : mix(PAL.grass, PAL.grass2, n2 > 0.55 ? 0.8 : n2 * 0.4);
          break;
        case Terrain.Forest:
          col = mix(PAL.forest, PAL.forest2, n > 0.6 ? 1 : 0.3);
          break;
        case Terrain.Mountain:
          col = mix(PAL.mountain, PAL.mountain2, n > 0.5 ? 0.9 : 0.2);
          break;
        case Terrain.Desert: {
          const dune = Math.sin(px * 0.25 + py * 0.5 + n2 * 4) > 0.75;
          col = dune ? [...PAL.desert2] : mix(PAL.desert, PAL.desert2, n * 0.3);
          break;
        }
        case Terrain.River:
          col = mix(PAL.river, PAL.river2, n2);
          if (n > 0.97) col = mix(col, PAL.foam, 0.5);
          break;
        default:
          col = [255, 0, 255];
      }
      const o = (py * W + px) * 4;
      data[o] = col[0];
      data[o + 1] = col[1];
      data[o + 2] = col[2];
      data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  decorate(world, g, seed);
  return canvas;
}

function decorate(world: World, g: CanvasRenderingContext2D, seed: number): void {
  const trees = [0, 1, 2, 3].map(drawTree);
  const peaks = [0, 1, 2].map(drawPeak);
  const cactus = drawCactus();
  const { size } = world;
  for (let y = 0; y < size; y++) {
    // Draw back-to-front so lower objects overlap upper ones.
    for (let x = 0; x < size; x++) {
      const t = world.terrain[y * size + x] as Terrain;
      const bx = x * TILE;
      const by = y * TILE;
      const h = hash2(x, y, seed + 77);
      if (t === Terrain.Forest) {
        const spots = [[1, 0], [8, 2], [4, 6], [10, 7]];
        for (let k = 0; k < spots.length; k++) {
          if (k === 3 && h < 0.5) continue;
          const v = Math.floor(hash2(x * 4 + k, y, seed) * 4);
          const [ox, oy] = spots[k];
          g.drawImage(trees[v], bx + ox - 1, by + oy - 3);
        }
      } else if (t === Terrain.Mountain) {
        g.drawImage(peaks[Math.floor(h * 3)], bx, by + 2);
        if (world.goldOre[y * size + x]) {
          g.fillStyle = '#f2c53d';
          g.fillRect(bx + 5, by + 10, 2, 1);
          g.fillRect(bx + 9, by + 12, 1, 1);
          g.fillRect(bx + 11, by + 9, 1, 1);
          g.fillStyle = '#fff6c9';
          g.fillRect(bx + 6, by + 10, 1, 1);
        }
      } else if (t === Terrain.Desert && h > 0.82) {
        g.drawImage(cactus, bx + 5 + Math.floor(h * 4), by + 6);
      } else if (t === Terrain.Grass && h > 0.8) {
        // tufts & flowers
        g.fillStyle = h > 0.93 ? '#f2e6a0' : '#4f8a3a';
        g.fillRect(bx + Math.floor(h * 12), by + Math.floor(h * 97) % 12 + 2, 1, 1);
        g.fillStyle = h > 0.9 ? '#e88fb0' : '#4f8a3a';
        g.fillRect(bx + Math.floor(h * 53) % 13 + 1, by + Math.floor(h * 31) % 12 + 2, 1, 1);
      } else if (t === Terrain.Beach && h > 0.9) {
        g.fillStyle = '#f7f1df';
        g.fillRect(bx + Math.floor(h * 71) % 13 + 1, by + Math.floor(h * 23) % 13 + 1, 2, 1);
      }
    }
  }
}

/** Small minimap image (1 px per tile). */
export function renderMinimap(world: World): HTMLCanvasElement {
  const [c, g] = makeCanvas(world.size, world.size);
  const img = g.createImageData(world.size, world.size);
  const cols: Record<number, RGB> = {
    [Terrain.Deep]: PAL.deep,
    [Terrain.Shallow]: PAL.shallow,
    [Terrain.Beach]: PAL.beach,
    [Terrain.Grass]: PAL.grass,
    [Terrain.Forest]: [0x3c, 0x7a, 0x34],
    [Terrain.Mountain]: PAL.mountain,
    [Terrain.Desert]: PAL.desert,
    [Terrain.River]: PAL.river,
  };
  for (let i = 0; i < world.size * world.size; i++) {
    const col = cols[world.terrain[i]];
    img.data.set([col[0], col[1], col[2], 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  return c;
}
