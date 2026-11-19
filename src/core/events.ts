import { EVENT_INTERVAL } from '../config/balance';
import { EVENTS, EVENT_BY_ID, type EventChoice, type EventDef } from '../config/events';
import { canAfford, pay, type CheckResult } from './buildingSystem';
import { mulberryStep } from './rng';
import type { GameState, World } from './types';

/** Draw a deterministic random number from the game's RNG. */
export function nextRandom(state: GameState): number {
  const [v, s] = mulberryStep(state.rng);
  state.rng = s;
  return v;
}

/** Possibly fires a new event this tick. Returns the event id if one fired. */
export function maybeTriggerEvent(state: GameState, world: World): string | null {
  if (state.pendingEvent || state.victory || state.tick < state.nextEventTick) return null;
  const recent = state.eventHistory.slice(-2);
  const pool = EVENTS.map((e) => ({ e, w: recent.includes(e.id) ? 0 : e.weight(state) })).filter((x) => x.w > 0);
  const [lo, hi] = EVENT_INTERVAL;
  state.nextEventTick = state.tick + lo + Math.floor(nextRandom(state) * (hi - lo));
  if (pool.length === 0) return null;
  const total = pool.reduce((s, x) => s + x.w, 0);
  let pick = nextRandom(state) * total;
  let chosen: EventDef = pool[0].e;
  for (const x of pool) {
    pick -= x.w;
    if (pick <= 0) {
      chosen = x.e;
      break;
    }
  }
  const data = chosen.roll ? chosen.roll(state, world, () => nextRandom(state)) : {};
  state.pendingEvent = { id: chosen.id, data };
  state.eventHistory.push(chosen.id);
  if (state.eventHistory.length > 20) state.eventHistory.shift();
  return chosen.id;
}

export function choiceAvailable(state: GameState, world: World, choice: EventChoice): CheckResult {
  const pe = state.pendingEvent;
  if (!pe) return { ok: false, reason: 'No event.' };
  const blocked = choice.blocked?.(state, pe.data, world);
  if (blocked) return { ok: false, reason: blocked };
  const cost = choice.cost?.(state, pe.data);
  if (cost && !canAfford(state, cost)) return { ok: false, reason: 'Cannot afford.' };
  return { ok: true };
}

/** Applies the player's decision. Returns the outcome text. */
export function resolveEvent(state: GameState, world: World, index: number): CheckResult & { text?: string } {
  const pe = state.pendingEvent;
  if (!pe) return { ok: false, reason: 'No event.' };
  const def = EVENT_BY_ID[pe.id];
  const choice = def?.choices[index];
  if (!choice) return { ok: false, reason: 'Invalid choice.' };
  const avail = choiceAvailable(state, world, choice);
  if (!avail.ok) return avail;
  const cost = choice.cost?.(state, pe.data);
  if (cost) pay(state, cost);
  const text = choice.apply(state, pe.data, world, nextRandom(state));
  state.pendingEvent = null;
  state.stats.eventsResolved++;
  return { ok: true, text };
}
