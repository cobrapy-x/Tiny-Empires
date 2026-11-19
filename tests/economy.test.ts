import { describe, expect, it } from 'vitest';
import { FOOD_PER_POP, TAX_LEVELS } from '../src/config/balance';
import { computeEconomy } from '../src/core/economy';
import { tick } from '../src/core/simulation';
import { addBuilt, newGame } from './helpers/setup';

describe('economy', () => {
  it('starts with town hall production, housing and storage', () => {
    const { state, world } = newGame();
    const r = computeEconomy(state, world);
    expect(r.housing).toBe(6);
    expect(r.storage).toBe(250);
    expect(r.production.food).toBeGreaterThan(0);
    expect(r.consumption.food).toBeCloseTo(state.population * FOOD_PER_POP);
    expect(r.production.gold).toBeGreaterThan(state.population * TAX_LEVELS[1].goldPerPop - 1e-9);
  });

  it('farms produce food only when staffed', () => {
    const { state, world } = newGame();
    const before = computeEconomy(state, world).production.food;
    addBuilt(state, world, 'farm');
    const staffed = computeEconomy(state, world).production.food;
    expect(staffed).toBeGreaterThan(before);
    state.population = 1; // only half the farm's 2 jobs filled
    const half = computeEconomy(state, world);
    expect(half.workforce).toBeCloseTo(0.5);
    expect(half.production.food - before * 1).toBeLessThan(staffed - before);
  });

  it('caps stored resources at storage capacity and never goes negative', () => {
    const { state, world } = newGame();
    state.resources.wood = 10_000;
    state.resources.food = 0;
    state.population = 6;
    tick(state, world);
    expect(state.resources.wood).toBeLessThanOrEqual(250);
    expect(state.resources.food).toBeGreaterThanOrEqual(0);
  });

  it('warehouses raise storage', () => {
    const { state, world } = newGame();
    addBuilt(state, world, 'warehouse');
    expect(computeEconomy(state, world).storage).toBe(450);
  });

  it('upkeep buildings stop working without gold', () => {
    const { state, world } = newGame();
    addBuilt(state, world, 'school');
    state.resources.gold = 100;
    const funded = computeEconomy(state, world);
    state.resources.gold = 0;
    const broke = computeEconomy(state, world);
    expect(broke.production.knowledge).toBeLessThan(funded.production.knowledge);
    expect(broke.consumption.gold).toBe(0);
  });

  it('starvation shrinks the population and hurts happiness', () => {
    const { state, world } = newGame();
    state.population = 30;
    state.resources.food = 0;
    const startHappy = state.happiness;
    for (let i = 0; i < 60; i++) tick(state, world);
    expect(state.population).toBeLessThan(30);
    expect(state.happiness).toBeLessThan(startHappy);
    expect(state.stats.starvationTicks).toBeGreaterThan(0);
  });

  it('grows the population when housed, fed and happy', () => {
    const { state, world } = newGame();
    addBuilt(state, world, 'house');
    addBuilt(state, world, 'farm');
    addBuilt(state, world, 'farm');
    for (let i = 0; i < 120; i++) tick(state, world);
    expect(state.population).toBeGreaterThan(6);
    expect(state.population).toBeLessThanOrEqual(computeEconomy(state, world).housing);
  });

  it('overcrowding lowers the happiness target', () => {
    const { state, world } = newGame();
    const ok = computeEconomy(state, world).happinessTarget;
    state.population = 12;
    expect(computeEconomy(state, world).happinessTarget).toBeLessThan(ok);
  });

  it('higher taxes give more gold but less happiness', () => {
    const { state, world } = newGame();
    state.taxRate = 0;
    const low = computeEconomy(state, world);
    state.taxRate = 2;
    const high = computeEconomy(state, world);
    expect(high.production.gold).toBeGreaterThan(low.production.gold);
    expect(high.happinessTarget).toBeLessThan(low.happinessTarget);
  });

  it('simulation is deterministic', () => {
    const run = (): string => {
      const { state, world } = newGame('det');
      addBuilt(state, world, 'farm');
      addBuilt(state, world, 'house');
      for (let i = 0; i < 600; i++) {
        tick(state, world);
        if (state.pendingEvent) state.pendingEvent = null;
      }
      return JSON.stringify(state);
    };
    expect(run()).toBe(run());
  });
});
