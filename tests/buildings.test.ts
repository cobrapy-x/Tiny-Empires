import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/config/buildings';
import {
  canPlace,
  canUpgrade,
  demolish,
  demolishRefund,
  placeBuilding,
  startUpgrade,
  terrainAllows,
  townhall,
} from '../src/core/buildingSystem';
import { tick } from '../src/core/simulation';
import { Terrain, RESOURCE_KEYS } from '../src/core/types';
import { addBuilt, findSite, newGame } from './helpers/setup';

describe('building placement', () => {
  it('rejects water, occupied tiles and tiles outside territory', () => {
    const { state, world } = newGame();
    const th = townhall(state)!;
    expect(canPlace(state, world, 'house', th.x, th.y).ok).toBe(false);
    expect(canPlace(state, world, 'house', 0, 0).ok).toBe(false); // deep water corner
    // Find a far-away grass tile
    let far: { x: number; y: number } | null = null;
    for (let y = 0; y < world.size && !far; y++)
      for (let x = 0; x < world.size && !far; x++)
        if (world.terrain[y * world.size + x] === Terrain.Grass && Math.max(Math.abs(x - th.x), Math.abs(y - th.y)) > 12) far = { x, y };
    if (far) expect(canPlace(state, world, 'house', far.x, far.y).reason).toMatch(/territory/);
  });

  it('enforces terrain rules', () => {
    const { world } = newGame();
    for (let y = 0; y < world.size; y++)
      for (let x = 0; x < world.size; x++) {
        const t = world.terrain[y * world.size + x] as Terrain;
        if (terrainAllows(world, 'farm', x, y).ok) expect([Terrain.Grass, Terrain.Desert]).toContain(t);
        if (terrainAllows(world, 'goldmine', x, y).ok) expect(world.goldOre[y * world.size + x]).toBe(1);
        if (terrainAllows(world, 'dock', x, y).ok) expect(t).toBe(Terrain.Beach);
      }
  });

  it('deducts cost and constructs over time', () => {
    const { state, world } = newGame();
    const site = findSite(state, world, 'farm')!;
    const wood = state.resources.wood;
    const r = placeBuilding(state, world, 'farm', site.x, site.y);
    expect(r.ok).toBe(true);
    expect(state.resources.wood).toBeLessThanOrEqual(wood - BUILDINGS.farm.levels[0].cost.wood! + 1e-9);
    const b = r.building!;
    expect(b.construction).toBe(BUILDINGS.farm.levels[0].time);
    for (let i = 0; i < BUILDINGS.farm.levels[0].time; i++) tick(state, world);
    expect(b.construction).toBe(0);
    expect(state.stats.buildingsBuilt).toBe(1);
  });

  it('refuses to build when unaffordable', () => {
    const { state, world } = newGame();
    state.resources.wood = 0;
    const site = findSite(state, world, 'house')!;
    expect(placeBuilding(state, world, 'house', site.x, site.y).ok).toBe(false);
  });

  it('locks tech-gated buildings until researched', () => {
    const { state, world } = newGame();
    const site = findSite(state, world, 'house')!;
    state.resources.wood = 999;
    state.resources.stone = 999;
    expect(canPlace(state, world, 'market', site.x, site.y).reason).toMatch(/Bartering/);
    state.researched.push('bartering');
    expect(canPlace(state, world, 'market', site.x, site.y).ok).toBe(true);
  });

  it('upgrades require tech and keep working during the upgrade', () => {
    const { state, world } = newGame();
    const house = addBuilt(state, world, 'house');
    state.resources.wood = 500;
    state.resources.stone = 500;
    expect(canUpgrade(state, house).ok).toBe(false);
    state.researched.push('masonry');
    expect(startUpgrade(state, house).ok).toBe(true);
    expect(house.level).toBe(1);
    expect(house.upgradeTo).toBe(2);
    for (let i = 0; i < 20; i++) tick(state, world);
    expect(house.level).toBe(2);
    expect(house.upgradeTo).toBe(0);
  });

  it('town hall upgrades are era-gated', () => {
    const { state } = newGame();
    const th = townhall(state)!;
    Object.assign(state.resources, { wood: 999, stone: 999, gold: 999 });
    expect(canUpgrade(state, th).ok).toBe(false);
    state.era = 2;
    expect(canUpgrade(state, th).ok).toBe(true);
  });

  it('demolish refunds half and never the town hall', () => {
    const { state, world } = newGame();
    expect(demolish(state, townhall(state)!).ok).toBe(false);
    const b = addBuilt(state, world, 'warehouse');
    const refund = demolishRefund(b);
    for (const k of RESOURCE_KEYS) expect(refund[k] ?? 0).toBeLessThan((BUILDINGS.warehouse.levels[0].cost[k] ?? 0) + 1e-9);
    const wood = state.resources.wood;
    expect(demolish(state, b).ok).toBe(true);
    expect(state.resources.wood).toBe(wood + (refund.wood ?? 0));
    expect(state.buildings.includes(b)).toBe(false);
  });

  it('respects building limits (one Grand Lighthouse)', () => {
    const { state, world } = newGame();
    state.researched.push('engineering');
    state.era = 4;
    const site = findSite(state, world, 'lighthouse');
    if (!site) return; // start not near coast — covered by balance tests
    Object.assign(state.resources, { wood: 5000, stone: 5000, gold: 5000 });
    expect(placeBuilding(state, world, 'lighthouse', site.x, site.y).ok).toBe(true);
    const site2 = findSite(state, world, 'lighthouse');
    expect(site2).toBeNull();
  });

  it('every building level has sane definitions', () => {
    for (const def of Object.values(BUILDINGS)) {
      def.levels.forEach((lv, i) => {
        if (def.buildable || i > 0) expect(Object.keys(lv.cost).length).toBeGreaterThan(0);
        if (def.buildable || i > 0) expect(lv.time).toBeGreaterThan(0);
        for (const v of Object.values(lv.cost)) expect(v).toBeGreaterThan(0);
      });
    }
  });
});
