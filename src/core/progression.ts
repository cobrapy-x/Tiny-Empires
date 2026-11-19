import { ERAS, MAX_ERA, type EraRequirement } from '../config/eras';
import { townhall } from './buildingSystem';
import type { GameState } from './types';

export interface RequirementProgress {
  label: string;
  current: number;
  target: number;
  met: boolean;
}

export function requirementProgress(state: GameState, req: EraRequirement): RequirementProgress[] {
  const out: RequirementProgress[] = [];
  const add = (label: string, current: number, target: number) =>
    out.push({ label, current: Math.min(current, target), target, met: current >= target });
  if (req.population) add('Population', state.population, req.population);
  if (req.techs) add('Technologies researched', state.researched.length, req.techs);
  if (req.buildings) add('Buildings', state.buildings.filter((b) => b.construction === 0 || b.upgradeTo > 0).length, req.buildings);
  if (req.townhallLevel) add(`Town Hall level`, townhall(state)?.level ?? 0, req.townhallLevel);
  if (req.lighthouse) {
    const done = state.buildings.some((b) => b.type === 'lighthouse' && b.construction === 0);
    add('Grand Lighthouse completed', done ? 1 : 0, 1);
  }
  return out;
}

export function nextEraProgress(state: GameState): { name: string; reward: string; reqs: RequirementProgress[] } | null {
  if (state.era >= MAX_ERA) return null;
  const next = ERAS[state.era];
  return { name: next.name, reward: next.reward, reqs: requirementProgress(state, next.requires) };
}

/** Advances the era if requirements are met. Returns the new era or null. */
export function checkEra(state: GameState): number | null {
  const next = nextEraProgress(state);
  if (!next || !next.reqs.every((r) => r.met)) return null;
  state.era++;
  return state.era;
}
