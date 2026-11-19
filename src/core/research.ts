import { TECHS, TECH_BY_ID, type TechDef } from '../config/techs';
import type { CheckResult } from './buildingSystem';
import type { GameState } from './types';

export type TechStatus = 'done' | 'active' | 'available' | 'locked';

export function techStatus(state: GameState, tech: TechDef): TechStatus {
  if (state.researched.includes(tech.id)) return 'done';
  if (state.research?.id === tech.id) return 'active';
  if (tech.tier > state.era) return 'locked';
  if (!tech.requires.every((r) => state.researched.includes(r))) return 'locked';
  return 'available';
}

export function canResearch(state: GameState, id: string): CheckResult {
  const tech = TECH_BY_ID[id];
  if (!tech) return { ok: false, reason: 'Unknown technology.' };
  const status = techStatus(state, tech);
  if (status === 'done') return { ok: false, reason: 'Already researched.' };
  if (state.research) return { ok: false, reason: 'Already researching something.' };
  if (tech.tier > state.era) return { ok: false, reason: `Requires era ${tech.tier}.` };
  const missing = tech.requires.filter((r) => !state.researched.includes(r));
  if (missing.length) return { ok: false, reason: `Requires ${missing.map((m) => TECH_BY_ID[m].name).join(' & ')}.` };
  if (state.resources.knowledge + 1e-9 < tech.cost) return { ok: false, reason: `Needs ${tech.cost} knowledge.` };
  return { ok: true };
}

export function startResearch(state: GameState, id: string): CheckResult {
  const check = canResearch(state, id);
  if (!check.ok) return check;
  const tech = TECH_BY_ID[id];
  state.resources.knowledge -= tech.cost;
  state.research = { id, remaining: tech.time, total: tech.time };
  return { ok: true };
}

/** Advances research by one tick. Returns the finished tech id, if any. */
export function tickResearch(state: GameState): string | null {
  if (!state.research) return null;
  state.research.remaining--;
  if (state.research.remaining > 0) return null;
  const id = state.research.id;
  state.researched.push(id);
  state.research = null;
  return id;
}

export function availableTechs(state: GameState): TechDef[] {
  return TECHS.filter((t) => techStatus(state, t) === 'available');
}
