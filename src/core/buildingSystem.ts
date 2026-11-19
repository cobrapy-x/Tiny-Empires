import { DEMOLISH_REFUND, TERRITORY_RADIUS } from '../config/balance';
import { BUILDINGS, type LevelDef } from '../config/buildings';
import { TECH_BY_ID } from '../config/techs';
import { countNeighbours, inBounds, isWater, terrainAt } from './world';
import {
  RESOURCE_KEYS,
  Terrain,
  type Building,
  type BuildingType,
  type Cost,
  type GameState,
  type World,
} from './types';

export interface CheckResult {
  ok: boolean;
  reason?: string;
}

export const levelDef = (type: BuildingType, level: number): LevelDef => BUILDINGS[type].levels[level - 1];

export const isActive = (b: Building): boolean => b.construction === 0 || b.upgradeTo > 0;

export function hasTech(state: GameState, id: string): boolean {
  return state.researched.includes(id);
}

export function canAfford(state: GameState, cost: Cost): boolean {
  return RESOURCE_KEYS.every((k) => (cost[k] ?? 0) <= state.resources[k] + 1e-9);
}

export function pay(state: GameState, cost: Cost): void {
  for (const k of RESOURCE_KEYS) state.resources[k] -= cost[k] ?? 0;
}

export function costText(cost: Cost): string {
  return RESOURCE_KEYS.filter((k) => cost[k]).map((k) => `${cost[k]} ${k}`).join(', ');
}

export function countType(state: GameState, type: BuildingType, includeConstruction = true): number {
  return state.buildings.filter((b) => b.type === type && (includeConstruction || isActive(b))).length;
}

export function townhall(state: GameState): Building | undefined {
  return state.buildings.find((b) => b.type === 'townhall');
}

/** Map of tile index → building id (0 = empty). */
export function occupancy(state: GameState, size: number): Int32Array {
  const occ = new Int32Array(size * size);
  for (const b of state.buildings) occ[b.y * size + b.x] = b.id;
  return occ;
}

export function buildingAt(state: GameState, x: number, y: number): Building | undefined {
  return state.buildings.find((b) => b.x === x && b.y === y);
}

/** Tiles the settlement controls; new buildings must go inside. */
export function territory(state: GameState, size: number): Uint8Array {
  const mask = new Uint8Array(size * size);
  for (const b of state.buildings) {
    const r =
      b.type === 'townhall'
        ? TERRITORY_RADIUS.townhall + (b.level - 1)
        : b.type === 'lighthouse'
          ? TERRITORY_RADIUS.lighthouse
          : TERRITORY_RADIUS.building;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = b.x + dx;
        const y = b.y + dy;
        if (x >= 0 && y >= 0 && x < size && y < size) mask[y * size + x] = 1;
      }
    }
  }
  return mask;
}

export function isUnlocked(state: GameState, type: BuildingType): CheckResult {
  const def = BUILDINGS[type];
  if (!def.buildable) return { ok: false, reason: 'Cannot be built.' };
  if (def.unlockTech && !hasTech(state, def.unlockTech))
    return { ok: false, reason: `Research ${TECH_BY_ID[def.unlockTech].name} first.` };
  if (def.unlockEra && state.era < def.unlockEra) return { ok: false, reason: `Requires era ${def.unlockEra}.` };
  if (def.limit !== undefined && countType(state, type) >= def.limit) return { ok: false, reason: 'Limit reached.' };
  return { ok: true };
}

const DRY = (t: Terrain): boolean => t === Terrain.Grass || t === Terrain.Desert || t === Terrain.Beach;

/** Terrain-only placement rule check (ignores territory, cost and occupancy). */
export function terrainAllows(world: World, type: BuildingType, x: number, y: number): CheckResult {
  if (!inBounds(world, x, y)) return { ok: false, reason: 'Outside the map.' };
  const t = terrainAt(world, x, y);
  const def = BUILDINGS[type];
  switch (def.placement) {
    case 'land':
      return DRY(t) ? { ok: true } : { ok: false, reason: 'Needs dry, flat land.' };
    case 'farm':
      return t === Terrain.Grass || t === Terrain.Desert ? { ok: true } : { ok: false, reason: 'Farms need grassland or desert.' };
    case 'nearForest':
      if (!DRY(t)) return { ok: false, reason: 'Needs dry, flat land.' };
      return countNeighbours(world, x, y, (n) => n === Terrain.Forest) > 0 ? { ok: true } : { ok: false, reason: 'Must be next to a forest.' };
    case 'nearMountain':
      if (!DRY(t)) return { ok: false, reason: 'Needs dry, flat land.' };
      return countNeighbours(world, x, y, (n) => n === Terrain.Mountain) > 0 ? { ok: true } : { ok: false, reason: 'Must be next to a mountain.' };
    case 'dock':
      if (t !== Terrain.Beach) return { ok: false, reason: 'Docks must be built on a beach.' };
      return countNeighbours(world, x, y, isWater) > 0 ? { ok: true } : { ok: false, reason: 'Must touch the sea.' };
    case 'goldOre':
      return t === Terrain.Mountain && world.goldOre[y * world.size + x] ? { ok: true } : { ok: false, reason: 'Needs a mountain with a gold vein.' };
    case 'coastal':
      if (!DRY(t)) return { ok: false, reason: 'Needs dry, flat land.' };
      return countNeighbours(world, x, y, isWater) > 0 ? { ok: true } : { ok: false, reason: 'Must be next to the sea.' };
  }
}

export function canPlace(state: GameState, world: World, type: BuildingType, x: number, y: number, terr?: Uint8Array): CheckResult {
  const unlocked = isUnlocked(state, type);
  if (!unlocked.ok) return unlocked;
  const ter = terrainAllows(world, type, x, y);
  if (!ter.ok) return ter;
  if (buildingAt(state, x, y)) return { ok: false, reason: 'Tile is occupied.' };
  const mask = terr ?? territory(state, world.size);
  if (!mask[y * world.size + x]) return { ok: false, reason: 'Outside your territory. Build closer to your settlement.' };
  if (!canAfford(state, levelDef(type, 1).cost)) return { ok: false, reason: `Not enough resources (${costText(levelDef(type, 1).cost)}).` };
  return { ok: true };
}

export function placeBuilding(state: GameState, world: World, type: BuildingType, x: number, y: number): CheckResult & { building?: Building } {
  const check = canPlace(state, world, type, x, y);
  if (!check.ok) return check;
  const def = levelDef(type, 1);
  pay(state, def.cost);
  const building: Building = {
    id: state.nextId++,
    type,
    x,
    y,
    level: 1,
    construction: def.time,
    constructionTotal: def.time,
    upgradeTo: 0,
  };
  state.buildings.push(building);
  return { ok: true, building };
}

export function canUpgrade(state: GameState, b: Building): CheckResult & { def?: LevelDef } {
  const levels = BUILDINGS[b.type].levels;
  if (b.construction > 0) return { ok: false, reason: 'Under construction.' };
  if (b.level >= levels.length) return { ok: false, reason: 'Fully upgraded.' };
  const def = levels[b.level];
  if (def.requiresEra && state.era < def.requiresEra) return { ok: false, reason: `Reach era ${def.requiresEra} first.`, def };
  if (def.requiresTech && !hasTech(state, def.requiresTech))
    return { ok: false, reason: `Research ${TECH_BY_ID[def.requiresTech].name} first.`, def };
  if (!canAfford(state, def.cost)) return { ok: false, reason: `Not enough resources (${costText(def.cost)}).`, def };
  return { ok: true, def };
}

export function startUpgrade(state: GameState, b: Building): CheckResult {
  const check = canUpgrade(state, b);
  if (!check.ok || !check.def) return check;
  pay(state, check.def.cost);
  b.upgradeTo = b.level + 1;
  b.construction = check.def.time;
  b.constructionTotal = check.def.time;
  return { ok: true };
}

/** Refund for demolishing: half of everything invested. Always < cost, so no exploit loops. */
export function demolishRefund(b: Building): Cost {
  const levels = BUILDINGS[b.type].levels;
  const invested: Cost = {};
  const paidLevels = b.upgradeTo > 0 ? b.upgradeTo : b.level;
  for (let i = 0; i < paidLevels; i++) {
    for (const k of RESOURCE_KEYS) invested[k] = (invested[k] ?? 0) + (levels[i].cost[k] ?? 0);
  }
  const refund: Cost = {};
  for (const k of RESOURCE_KEYS) if (invested[k]) refund[k] = Math.floor((invested[k] ?? 0) * DEMOLISH_REFUND);
  return refund;
}

export function demolish(state: GameState, b: Building): CheckResult {
  if (b.type === 'townhall') return { ok: false, reason: 'The Town Hall cannot be demolished.' };
  if (b.type === 'lighthouse' && b.construction === 0) return { ok: false, reason: 'Wonders are forever.' };
  const idx = state.buildings.indexOf(b);
  if (idx < 0) return { ok: false, reason: 'Unknown building.' };
  const refund = demolishRefund(b);
  for (const k of RESOURCE_KEYS) state.resources[k] += refund[k] ?? 0;
  state.buildings.splice(idx, 1);
  return { ok: true };
}

/**
 * Site multiplier for a building based on its surroundings
 * (forest for mills, mountains for quarries, rivers for farms...).
 */
export function siteMultiplier(state: GameState, world: World, b: Building): number {
  const { x, y } = b;
  switch (b.type) {
    case 'farm': {
      const t = terrainAt(world, x, y);
      let m = t === Terrain.Desert && !hasTech(state, 'irrigation') ? 0.5 : 1;
      if (countNeighbours(world, x, y, (n) => n === Terrain.River) > 0) m += 0.4;
      return m;
    }
    case 'lumbermill':
      return Math.min(6, countNeighbours(world, x, y, (n) => n === Terrain.Forest)) / 3;
    case 'quarry':
      return Math.min(6, countNeighbours(world, x, y, (n) => n === Terrain.Mountain)) / 3;
    case 'dock':
      return Math.min(1.6, countNeighbours(world, x, y, isWater) / 3);
    default:
      return 1;
  }
}

/** Preview of the site multiplier for placing `type` at (x, y). */
export function previewSite(state: GameState, world: World, type: BuildingType, x: number, y: number): number {
  return siteMultiplier(state, world, { id: -1, type, x, y, level: 1, construction: 0, constructionTotal: 0, upgradeTo: 0 });
}

