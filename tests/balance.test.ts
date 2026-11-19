import { describe, expect, it } from 'vitest';
import { TRADE } from '../src/config/balance';
import { computeEconomy } from '../src/core/economy';
import { demolish, placeBuilding } from '../src/core/buildingSystem';
import { tick } from '../src/core/simulation';
import { buyPrice, sellPrice, trade, TRADABLES } from '../src/core/trade';
import { createGame } from '../src/core/state';
import { RESOURCE_KEYS } from '../src/core/types';
import { botAct, botResolve } from './helpers/bot';
import { addBuilt, findSite, newGame } from './helpers/setup';

function playBot(seed: string, size = 64, maxTicks = 4200) {
  const { state, world } = createGame(seed, size);
  const eraAt: number[] = [];
  for (let t = 0; t < maxTicks && !state.victory; t++) {
    if (t % 3 === 0) botAct(state, world);
    botResolve(state, world);
    for (const m of tick(state, world)) if (m.kind === 'era') eraAt.push(state.tick);
  }
  return { state, world, eraAt };
}

describe('progression & balance (scripted player)', () => {
  const seeds = ['amber-1234', 'tide-42', 'coral-7', 'fjord-99', 'opal-5150', 'sage-2024'];

  it.each(seeds)('seed %s: reaches every era and wins in a reasonable time', (seed) => {
    const { state, eraAt } = playBot(seed);
    expect(state.era).toBeGreaterThanOrEqual(4);
    expect(state.victory).toBe(true);
    // Not trivially fast, not endless: 15–70 minutes of game time for a simple bot.
    expect(state.tick).toBeGreaterThan(15 * 60);
    expect(state.tick).toBeLessThan(70 * 60);
    // First milestone arrives early to hook the player.
    expect(eraAt[0]).toBeLessThan(12 * 60);
  }, 30_000);

  it('works on small and large islands', () => {
    expect(playBot('small-isle', 48).state.era).toBeGreaterThanOrEqual(3);
    expect(playBot('large-isle', 80).state.era).toBeGreaterThanOrEqual(3);
  }, 30_000);
});

describe('deadlock prevention', () => {
  it('a completely broke settlement recovers via town hall income', () => {
    const { state, world } = newGame('broke');
    for (const k of RESOURCE_KEYS) state.resources[k] = 0;
    for (let i = 0; i < 120; i++) {
      tick(state, world);
      state.pendingEvent = null;
    }
    expect(state.resources.wood).toBeGreaterThanOrEqual(24); // enough for a house/farm
    expect(state.population).toBeGreaterThanOrEqual(1);
    const site = findSite(state, world, 'farm')!;
    expect(placeBuilding(state, world, 'farm', site.x, site.y).ok).toBe(true);
  });

  it('population never drops below 1 even under total famine', () => {
    const { state, world } = newGame('famine');
    state.population = 5;
    for (let i = 0; i < 2000; i++) {
      state.resources.food = 0;
      tick(state, world);
      state.pendingEvent = null;
    }
    expect(state.population).toBeGreaterThanOrEqual(1);
  });

  it('every new world has room for the essential first buildings', () => {
    for (let i = 0; i < 30; i++) {
      const { state, world } = createGame(`deadlock-${i}`, 64);
      for (const t of ['farm', 'house', 'lumbermill', 'quarry', 'school', 'warehouse'] as const) {
        expect(findSite(state, world, t), `${t} on deadlock-${i}`).not.toBeNull();
      }
    }
  });
});

describe('exploit checks', () => {
  it('buying then selling any resource always loses gold', () => {
    const { state, world } = newGame('trade');
    state.researched.push('bartering', 'currency', 'navigation');
    for (let m = 0; m < 6; m++) addBuilt(state, world, 'market');
    for (const r of TRADABLES) expect(buyPrice(state, r)).toBeGreaterThan(sellPrice(state, r));
    state.resources.gold = 200;
    state.resources.wood = 0;
    const g0 = state.resources.gold;
    expect(trade(state, world, 'wood', 'buy').ok).toBe(true);
    expect(trade(state, world, 'wood', 'sell').ok).toBe(true);
    expect(state.resources.gold).toBeLessThan(g0);
    expect(state.resources.wood).toBe(0);
  });

  it('trade requires a finished market', () => {
    const { state, world } = newGame('nomarket');
    state.resources.food = 100;
    expect(trade(state, world, 'food', 'sell').ok).toBe(false);
  });

  it('build/demolish loops never generate resources', () => {
    const { state, world } = newGame('loop');
    Object.assign(state.resources, { wood: 600, stone: 600 });
    const before = { ...state.resources };
    for (let i = 0; i < 10; i++) {
      const site = findSite(state, world, 'warehouse')!;
      const r = placeBuilding(state, world, 'warehouse', site.x, site.y);
      expect(r.ok).toBe(true);
      demolish(state, r.building!);
    }
    expect(state.resources.wood).toBeLessThan(before.wood);
    expect(state.resources.stone).toBeLessThan(before.stone);
  });

  it('stored resources never exceed capacity after a tick', () => {
    const { state, world } = newGame('cap');
    for (let i = 0; i < 6; i++) addBuilt(state, world, 'farm');
    for (let i = 0; i < 400; i++) {
      tick(state, world);
      state.pendingEvent = null;
      const cap = computeEconomy(state, world).storage;
      for (const k of ['food', 'wood', 'stone', 'gold'] as const) expect(state.resources[k]).toBeLessThanOrEqual(cap + 1e-6);
    }
  });

  it('trade lot sizes are consistent', () => {
    expect(TRADE.sellFactor).toBeLessThan(TRADE.buyFactor);
  });
});
