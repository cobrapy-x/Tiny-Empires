import { GROWTH, HAPPINESS } from '../config/balance';
import { techEffects, modifierProduct, type EconomyReport } from './economy';
import type { GameState } from './types';

/** Moves happiness toward its target and grows/shrinks the population. Returns pop delta. */
export function updatePopulation(state: GameState, report: EconomyReport): number {
  const diff = report.happinessTarget - state.happiness;
  state.happiness += Math.sign(diff) * Math.min(Math.abs(diff), HAPPINESS.drift);

  const starving = state.resources.food <= 0.01 && report.net.food < 0;
  let rate = 0;
  if (starving) {
    rate = -GROWTH.starveDecline;
    state.stats.starvationTicks++;
  } else if (state.happiness < GROWTH.unhappyThreshold) {
    rate = -GROWTH.unhappyDecline;
  } else if (state.population < report.housing && state.happiness >= GROWTH.minHappiness && state.resources.food > 5) {
    const tech = techEffects(state);
    rate = (GROWTH.base + (state.happiness - GROWTH.minHappiness) * GROWTH.perHappiness) * (1 + tech.growth) * modifierProduct(state, 'growthMul') * (GROWTH.sizeDamping / (GROWTH.sizeDamping + state.population));
  } else {
    // Drift the accumulator back toward zero when nothing is happening.
    state.popProgress *= 0.98;
  }
  state.popProgress += rate;
  let delta = 0;
  while (state.popProgress >= 1 && state.population < report.housing) {
    state.population++;
    state.popProgress -= 1;
    delta++;
  }
  if (state.popProgress >= 1) state.popProgress = 0.99;
  while (state.popProgress <= -1 && state.population > 1) {
    state.population--;
    state.popProgress += 1;
    delta--;
  }
  if (state.popProgress <= -1) state.popProgress = -0.99;
  state.stats.peakPopulation = Math.max(state.stats.peakPopulation, state.population);
  state.stats.peakHappiness = Math.max(state.stats.peakHappiness, Math.round(state.happiness));
  return delta;
}
