import { describe, expect, it } from 'vitest';
import { deserialize, loadFromSlot, saveToSlot, serialize, slotInfo, type KeyValueStore } from '../src/core/save';
import { tick } from '../src/core/simulation';
import { generateWorld } from '../src/core/world';
import { startResearch } from '../src/core/research';
import { addBuilt, newGame } from './helpers/setup';
import { GameController } from '../src/game/GameController';

function memStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

function playedGame() {
  const { state, world } = newGame('save-test');
  addBuilt(state, world, 'farm');
  addBuilt(state, world, 'house');
  addBuilt(state, world, 'lumbermill');
  state.resources.knowledge = 50;
  startResearch(state, 'fishing');
  for (let i = 0; i < 300; i++) {
    tick(state, world);
    if (state.pendingEvent) state.pendingEvent = null;
  }
  return { state, world };
}

describe('save / load', () => {
  it('round-trips the full game state exactly', () => {
    const { state } = playedGame();
    const loaded = deserialize(serialize(state)).state;
    expect(loaded).toEqual(state);
  });

  it('a loaded game continues identically to the original', () => {
    const { state, world } = playedGame();
    const copy = deserialize(serialize(state)).state;
    const world2 = generateWorld(copy.seed, copy.size);
    expect(Array.from(world2.terrain)).toEqual(Array.from(world.terrain));
    for (let i = 0; i < 300; i++) {
      tick(state, world);
      tick(copy, world2);
      if (state.pendingEvent) {
        state.pendingEvent = null;
        copy.pendingEvent = null;
      }
    }
    expect(copy).toEqual(state);
  });

  it('saves to and loads from slots', () => {
    const kv = memStore();
    const { state } = playedGame();
    saveToSlot(kv, 'slot1', state, 1234);
    const f = loadFromSlot(kv, 'slot1')!;
    expect(f.savedAt).toBe(1234);
    expect(f.state).toEqual(state);
    expect(slotInfo(kv, 'slot1')?.population).toBe(state.population);
    expect(loadFromSlot(kv, 'slot2')).toBeNull();
  });

  it('rejects corrupt or malicious data with a readable error', () => {
    expect(() => deserialize('not json')).toThrow(/JSON/);
    expect(() => deserialize('{}')).toThrow(/missing/);
    const { state } = playedGame();
    const bad = JSON.parse(serialize(state));
    bad.state.buildings[0].type = 'castle';
    expect(() => deserialize(JSON.stringify(bad))).toThrow(/corrupt/);
    const bad2 = JSON.parse(serialize(state));
    bad2.state.resources.gold = 'lots';
    expect(() => deserialize(JSON.stringify(bad2))).toThrow(/corrupt/);
    const future = JSON.parse(serialize(state));
    future.version = 999;
    expect(() => deserialize(JSON.stringify(future))).toThrow(/newer/);
  });

  it('migrates older saves missing optional fields', () => {
    const { state } = playedGame();
    const old = JSON.parse(serialize(state));
    delete old.state.stats;
    delete old.state.modifiers;
    delete old.state.achievements;
    const loaded = deserialize(JSON.stringify(old)).state;
    expect(loaded.stats.buildingsBuilt).toBe(0);
    expect(loaded.modifiers).toEqual([]);
  });

  it('controller save/load keeps state and reports errors', () => {
    const kv = memStore();
    const c = new GameController(kv);
    c.newGame('ctrl-seed', 48);
    for (let i = 0; i < 30; i++) c.update(1000);
    const snapshot = JSON.stringify(c.state);
    c.saveSlot('slot2');
    c.newGame('other', 48);
    expect(c.loadSlot('slot2')).toBeNull();
    expect(JSON.stringify(c.state)).toBe(snapshot);
    expect(c.loadSlot('slot3')).toMatch(/empty/);
    kv.setItem('tinyempires.save.slot3', '{garbage');
    expect(c.loadSlot('slot3')).toMatch(/JSON/);
    expect(JSON.stringify(c.state)).toBe(snapshot); // failed load leaves game untouched
  });
});
