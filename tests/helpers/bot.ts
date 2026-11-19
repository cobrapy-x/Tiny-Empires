/**
 * A simple greedy "player" used by balance tests. It is intentionally not
 * optimal — if this bot can finish the game, a human certainly can.
 */
import { TECHS } from '../../src/config/techs';
import {
  canPlace,
  canUpgrade,
  countType,
  placeBuilding,
  previewSite,
  startUpgrade,
  territory,
  townhall,
} from '../../src/core/buildingSystem';
import { computeEconomy } from '../../src/core/economy';
import { canResearch, startResearch } from '../../src/core/research';
import { EVENT_BY_ID } from '../../src/config/events';
import { choiceAvailable, resolveEvent } from '../../src/core/events';
import { isWater } from '../../src/core/world';
import { Terrain } from '../../src/core/types';
import type { BuildingType, GameState, World } from '../../src/core/types';

function bestSite(state: GameState, world: World, type: BuildingType): { x: number; y: number } | null {
  const th = townhall(state)!;
  const mask = territory(state, world.size);
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;
  for (let y = 0; y < world.size; y++) {
    for (let x = 0; x < world.size; x++) {
      if (!mask[y * world.size + x]) continue;
      if (!canPlace(state, world, type, x, y, mask).ok) continue;
      const site = previewSite(state, world, type, x, y);
      const dist = Math.hypot(x - th.x, y - th.y);
      const productive = ['farm', 'lumbermill', 'quarry', 'dock'].includes(type);
      const score = (productive ? site * 10 : 0) - dist * (productive ? 0.3 : 1);
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best;
}

function tryBuild(state: GameState, world: World, type: BuildingType): boolean {
  const site = bestSite(state, world, type);
  if (!site) return false;
  return placeBuilding(state, world, type, site.x, site.y).ok;
}

function tryUpgradeAny(state: GameState, types: BuildingType[]): boolean {
  for (const b of state.buildings) {
    if (!types.includes(b.type)) continue;
    if (canUpgrade(state, b).ok) return startUpgrade(state, b).ok;
  }
  return false;
}

/** Pick the first affordable choice of a pending event. */
export function botResolve(state: GameState, world: World): void {
  if (!state.pendingEvent) return;
  const def = EVENT_BY_ID[state.pendingEvent.id];
  const idx = def.choices.findIndex((c) => choiceAvailable(state, world, c).ok);
  resolveEvent(state, world, Math.max(0, idx));
}

/** Expand territory toward the coast by building a house on the land tile nearest to the sea. */
function expandToCoast(state: GameState, world: World): boolean {
  const mask = territory(state, world.size);
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let y = 0; y < world.size; y++)
    for (let x = 0; x < world.size; x++) {
      if (!mask[y * world.size + x] || !canPlace(state, world, 'house', x, y, mask).ok) continue;
      let d = Infinity;
      for (let yy = 0; yy < world.size; yy++)
        for (let xx = 0; xx < world.size; xx++)
          if (isWater(world.terrain[yy * world.size + xx] as Terrain)) d = Math.min(d, Math.abs(xx - x) + Math.abs(yy - y));
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  return !!best && placeBuilding(state, world, 'house', best.x, best.y).ok;
}

export function botAct(state: GameState, world: World): void {
  botResolve(state, world);
  const r = computeEconomy(state, world);
  const res = state.resources;
  const building = state.buildings.some((b) => b.construction > 0 && b.upgradeTo === 0);

  // Research: cheapest available, prefer ones that unlock progression.
  if (!state.research) {
    const order = TECHS.filter((t) => canResearch(state, t.id).ok).sort((a, b) => a.cost - b.cost);
    if (order[0]) startResearch(state, order[0].id);
  }

  // Lighthouse is the goal.
  if (state.researched.includes('engineering') && state.era >= 4 && countType(state, 'lighthouse') === 0) {
    if (tryBuild(state, world, 'lighthouse')) return;
    if (!bestSite(state, world, 'lighthouse') && state.tick % 30 === 0 && expandToCoast(state, world)) return;
  }
  if (building && state.buildings.filter((b) => b.construction > 0).length > 2) return;

  const th = townhall(state)!;
  if (canUpgrade(state, th).ok) {
    startUpgrade(state, th);
    return;
  }

  // Keep food healthy.
  if (r.net.food < 0.4 + state.population * 0.01) {
    if (tryUpgradeAny(state, ['farm'])) return;
    if (tryBuild(state, world, 'farm')) return;
    if (tryBuild(state, world, 'dock')) return;
  }
  if (countType(state, 'lumbermill') < 1 + Math.floor(state.population / 25) && tryBuild(state, world, 'lumbermill')) return;
  if (countType(state, 'quarry') < 1 + Math.floor(state.population / 25) && tryBuild(state, world, 'quarry')) return;

  // Housing.
  if (r.housing - state.population < 3) {
    if (tryUpgradeAny(state, ['house'])) return;
    if (tryBuild(state, world, 'house')) return;
  }
  // Jobs for the unemployed.
  if (state.population - r.jobs > 3) {
    if (countType(state, 'school') < 1 + state.era && tryBuild(state, world, 'school')) return;
    if (tryBuild(state, world, 'goldmine')) return;
    if (tryBuild(state, world, 'market')) return;
    if (tryBuild(state, world, 'farm')) return;
  }
  if (state.happiness < 50) {
    if (tryBuild(state, world, 'temple')) return;
    if (countType(state, 'market') < 3 && tryBuild(state, world, 'market')) return;
    if (state.taxRate > 0) state.taxRate = (state.taxRate - 1) as 0 | 1;
  } else if (state.happiness > 70 && state.taxRate < 1) {
    state.taxRate = 1;
  }
  // Storage pressure.
  const full = (['food', 'wood', 'stone', 'gold'] as const).some((k) => res[k] > r.storage * 0.9);
  const needBig = state.era >= 4 && r.storage < 950;
  if ((full || needBig) && (tryUpgradeAny(state, ['warehouse']) || tryBuild(state, world, 'warehouse'))) return;
  if (countType(state, 'school') < state.era && tryBuild(state, world, 'school')) return;
  tryUpgradeAny(state, ['school', 'lumbermill', 'quarry', 'market', 'goldmine', 'temple', 'dock']);
}
