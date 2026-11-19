import { describe, expect, it } from 'vitest';
import { TECHS, TECH_BY_ID } from '../src/config/techs';
import { ERAS } from '../src/config/eras';
import { canResearch, startResearch, tickResearch } from '../src/core/research';
import { checkEra } from '../src/core/progression';
import { tick } from '../src/core/simulation';
import { addBuilt, newGame } from './helpers/setup';

describe('research', () => {
  it('tech tree is well-formed (prereqs exist, have lower or equal tier, no cycles)', () => {
    for (const t of TECHS) {
      for (const r of t.requires) {
        expect(TECH_BY_ID[r]).toBeDefined();
        expect(TECH_BY_ID[r].tier).toBeLessThanOrEqual(t.tier);
      }
    }
    const visiting = new Set<string>();
    const ok = (id: string): boolean => {
      if (visiting.has(id)) return false;
      visiting.add(id);
      const res = TECH_BY_ID[id].requires.every(ok);
      visiting.delete(id);
      return res;
    };
    for (const t of TECHS) expect(ok(t.id)).toBe(true);
  });

  it('costs knowledge, takes time and completes', () => {
    const { state } = newGame();
    expect(canResearch(state, 'bartering').ok).toBe(false);
    state.resources.knowledge = 100;
    expect(startResearch(state, 'bartering').ok).toBe(true);
    expect(state.resources.knowledge).toBe(70);
    expect(canResearch(state, 'fishing').reason).toMatch(/Already researching/);
    let done: string | null = null;
    for (let i = 0; i < 100 && !done; i++) done = tickResearch(state);
    expect(done).toBe('bartering');
    expect(state.researched).toContain('bartering');
  });

  it('gates tiers behind eras and prerequisites', () => {
    const { state } = newGame();
    state.resources.knowledge = 10_000;
    expect(canResearch(state, 'irrigation').ok).toBe(false);
    state.era = 2;
    expect(canResearch(state, 'irrigation').reason).toMatch(/Tools/);
    state.researched.push('tools');
    expect(canResearch(state, 'irrigation').ok).toBe(true);
  });

  it('advances eras when requirements are met', () => {
    const { state, world } = newGame();
    expect(checkEra(state)).toBeNull();
    state.population = ERAS[1].requires.population!;
    state.researched.push('tools', 'masonry');
    for (let i = 0; i < 7; i++) addBuilt(state, world, i % 2 ? 'house' : 'farm');
    expect(checkEra(state)).toBe(2);
    expect(state.era).toBe(2);
  });

  it('the simulation reports completed research', () => {
    const { state, world } = newGame();
    state.resources.knowledge = 100;
    startResearch(state, 'fishing');
    const msgs = [];
    for (let i = 0; i < 20; i++) msgs.push(...tick(state, world));
    expect(msgs.some((m) => m.kind === 'researched')).toBe(true);
  });
});
