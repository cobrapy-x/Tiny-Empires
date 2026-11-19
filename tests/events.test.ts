import { describe, expect, it } from 'vitest';
import { EVENTS, EVENT_BY_ID } from '../src/config/events';
import { choiceAvailable, maybeTriggerEvent, resolveEvent } from '../src/core/events';
import { tick } from '../src/core/simulation';
import { addBuilt, newGame } from './helpers/setup';

function richState(seed = 'events') {
  const g = newGame(seed);
  const { state, world } = g;
  for (const t of ['farm', 'farm', 'lumbermill', 'quarry', 'school', 'house', 'house'] as const) addBuilt(state, world, t);
  state.population = 30;
  state.era = 3;
  state.tick = 1000;
  state.happiness = 70;
  Object.assign(state.resources, { food: 200, wood: 200, stone: 200, gold: 200, knowledge: 50 });
  return g;
}

describe('events', () => {
  it('fires on schedule, pauses the world, and resolves', () => {
    const { state, world } = richState();
    state.nextEventTick = state.tick + 1;
    let fired = false;
    for (let i = 0; i < 5 && !fired; i++) fired = tick(state, world).some((m) => m.kind === 'event');
    expect(fired).toBe(true);
    const t = state.tick;
    tick(state, world);
    expect(state.tick).toBe(t); // paused while pending
    const def = EVENT_BY_ID[state.pendingEvent!.id];
    const idx = def.choices.findIndex((c) => choiceAvailable(state, world, c).ok);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(resolveEvent(state, world, idx).ok).toBe(true);
    expect(state.pendingEvent).toBeNull();
    expect(state.stats.eventsResolved).toBe(1);
  });

  it('every event always has at least one free choice (no deadlocks)', () => {
    for (const ev of EVENTS) expect(ev.choices.some((c) => !c.cost && !c.blocked)).toBe(true);
  });

  it('every choice of every event applies without errors and keeps resources valid', () => {
    for (const ev of EVENTS) {
      for (let i = 0; i < ev.choices.length; i++) {
        const { state, world } = richState(`ev-${ev.id}-${i}`);
        state.research = { id: 'bartering', remaining: 10, total: 20 };
        const data = ev.roll ? ev.roll(state, world, () => 0.5) : {};
        state.pendingEvent = { id: ev.id, data };
        expect(ev.text(state, data).length).toBeGreaterThan(5);
        const r = resolveEvent(state, world, i);
        expect(r.ok).toBe(true);
        for (const v of Object.values(state.resources)) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
        }
        expect(state.population).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('unaffordable choices are refused', () => {
    const { state, world } = richState();
    state.resources.gold = 0;
    state.pendingEvent = { id: 'termites', data: {} };
    expect(resolveEvent(state, world, 0).ok).toBe(false);
    expect(resolveEvent(state, world, 1).ok).toBe(true);
  });

  it('event selection is deterministic for a given state', () => {
    const a = richState('same');
    const b = richState('same');
    a.state.nextEventTick = b.state.nextEventTick = 0;
    expect(maybeTriggerEvent(a.state, a.world)).toBe(maybeTriggerEvent(b.state, b.world));
    expect(a.state.pendingEvent).toEqual(b.state.pendingEvent);
  });

  it('does not repeat the same event back to back', () => {
    const { state, world } = richState('norepeat');
    let last = '';
    for (let i = 0; i < 40; i++) {
      state.nextEventTick = 0;
      const id = maybeTriggerEvent(state, world);
      if (!id) continue;
      expect(id).not.toBe(last);
      last = id;
      state.pendingEvent = null;
    }
  });

  it('haggling never creates resources out of thin air when it fails', () => {
    const { state, world } = richState('haggle');
    const before = { ...state.resources };
    state.pendingEvent = { id: 'caravan', data: { res: 1, amount: 40, buying: 1, gold: 44 } };
    // Force failure path by choosing with a deterministic rng state; check both outcomes are consistent.
    resolveEvent(state, world, 1);
    const woodDiff = state.resources.wood - before.wood;
    const goldDiff = state.resources.gold - before.gold;
    expect((woodDiff === 0 && goldDiff === 0) || (woodDiff === -40 && goldDiff > 44)).toBe(true);
  });
});
