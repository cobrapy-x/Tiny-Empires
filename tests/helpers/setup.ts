import { canPlace, placeBuilding, territory } from '../../src/core/buildingSystem';
import { createGame } from '../../src/core/state';
import type { Building, BuildingType, GameState, World } from '../../src/core/types';

export function newGame(seed = 'test-island'): { state: GameState; world: World } {
  return createGame(seed, 64);
}

/** Find any tile where `type` can currently be placed (resources ignored if rich=true). */
export function findSite(state: GameState, world: World, type: BuildingType): { x: number; y: number } | null {
  const mask = territory(state, world.size);
  const saved = { ...state.resources };
  Object.assign(state.resources, { food: 1e6, wood: 1e6, stone: 1e6, gold: 1e6, knowledge: 1e6 });
  try {
    for (let y = 0; y < world.size; y++)
      for (let x = 0; x < world.size; x++) if (mask[y * world.size + x] && canPlace(state, world, type, x, y, mask).ok) return { x, y };
    return null;
  } finally {
    state.resources = saved;
  }
}

/** Place a building for free and finish construction instantly. */
export function addBuilt(state: GameState, world: World, type: BuildingType): Building {
  const site = findSite(state, world, type);
  if (!site) throw new Error(`no site for ${type}`);
  const saved = { ...state.resources };
  Object.assign(state.resources, { food: 1e6, wood: 1e6, stone: 1e6, gold: 1e6, knowledge: 1e6 });
  const r = placeBuilding(state, world, type, site.x, site.y);
  state.resources = saved;
  if (!r.building) throw new Error(r.reason);
  r.building.construction = 0;
  return r.building;
}
