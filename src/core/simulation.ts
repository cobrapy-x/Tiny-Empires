import { checkAchievements } from '../config/achievements';
import { computeEconomy, type EconomyReport } from './economy';
import { maybeTriggerEvent } from './events';
import { updatePopulation } from './population';
import { checkEra } from './progression';
import { tickResearch } from './research';
import { RESOURCE_KEYS, STORED_RESOURCES, type GameMessage, type GameState, type World } from './types';

/**
 * Advance the simulation by exactly one tick (one game second).
 * Deterministic: depends only on state + world.
 */
export function tick(state: GameState, world: World): GameMessage[] {
  const messages: GameMessage[] = [];
  if (state.pendingEvent) return messages; // world waits for the player's decision
  state.tick++;

  // 1. Construction & upgrades
  for (const b of state.buildings) {
    if (b.construction <= 0) continue;
    b.construction--;
    if (b.construction > 0) continue;
    if (b.upgradeTo > 0) {
      b.level = b.upgradeTo;
      b.upgradeTo = 0;
      state.stats.upgradesDone++;
      messages.push({ kind: 'upgraded', building: b });
    } else {
      state.stats.buildingsBuilt++;
      messages.push({ kind: 'built', building: b });
      if (b.type === 'lighthouse' && !state.victory) {
        state.victory = true;
        messages.push({ kind: 'victory' });
      }
    }
  }

  // 2. Economy
  const report = computeEconomy(state, world);
  applyEconomy(state, report);

  // 3. Population & happiness
  const delta = updatePopulation(state, report);
  if (delta !== 0) messages.push({ kind: 'popChange', delta });

  // 4. Research
  const done = tickResearch(state);
  if (done) messages.push({ kind: 'researched', techId: done });

  // 5. Temporary modifiers
  for (const m of state.modifiers) m.remaining--;
  state.modifiers = state.modifiers.filter((m) => m.remaining > 0);

  // 6. Progression
  const era = checkEra(state);
  if (era) messages.push({ kind: 'era', era });

  // 7. Events & achievements
  const ev = maybeTriggerEvent(state, world);
  if (ev) messages.push({ kind: 'event', eventId: ev });
  for (const id of checkAchievements(state)) messages.push({ kind: 'achievement', id });

  return messages;
}

export function applyEconomy(state: GameState, report: EconomyReport): void {
  for (const k of RESOURCE_KEYS) {
    state.resources[k] += report.net[k];
    state.stats.produced[k] += report.production[k];
    if (state.resources[k] < 0) state.resources[k] = 0;
  }
  for (const k of STORED_RESOURCES) {
    if (state.resources[k] > report.storage) state.resources[k] = report.storage;
  }
}
