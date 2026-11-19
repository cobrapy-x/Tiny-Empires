/** Global tuning constants. All rates are per simulation tick (1 tick = 1 game second). */
export const SAVE_VERSION = 1;

export const DAY_LENGTH = 120;
export const SPEEDS = [0, 1, 2, 4] as const;

export const START = {
  food: 90,
  wood: 90,
  stone: 25,
  gold: 40,
  knowledge: 0,
  population: 6,
  happiness: 62,
};

export const FOOD_PER_POP = 0.13;

export const TAX_LEVELS = [
  { label: 'Low', goldPerPop: 0.012, happiness: 8 },
  { label: 'Normal', goldPerPop: 0.028, happiness: 0 },
  { label: 'High', goldPerPop: 0.05, happiness: -14 },
] as const;

export const DEMOLISH_REFUND = 0.5;
export const TERRITORY_RADIUS = { townhall: 5, building: 2, lighthouse: 4 };

export const HAPPINESS = {
  base: 52,
  /** Points lost per resident above housing capacity. */
  overcrowdPerPerson: 3,
  overcrowdMax: 30,
  starving: -25,
  wellFed: 4,
  unemploymentMax: -12,
  /** City stress: -1 per this many residents. */
  stressPerPop: 7,
  /** Happiness moves toward its target at this rate per tick. */
  drift: 0.5,
};

export const GROWTH = {
  minHappiness: 35,
  base: 0.05,
  perHappiness: 0.0035,
  starveDecline: 0.06,
  unhappyDecline: 0.03,
  unhappyThreshold: 22,
  /** Larger settlements grow proportionally slower. */
  sizeDamping: 60,
};

/** Production multiplier from happiness. */
export function happinessMultiplier(h: number): number {
  if (h >= 80) return 1.15;
  if (h >= 65) return 1.07;
  if (h < 20) return 0.7;
  if (h < 35) return 0.85;
  return 1;
}

/** Trade values (gold per unit). Sell gets less than buy costs, so loops never profit. */
export const TRADE = {
  lot: 10,
  value: { food: 0.9, wood: 1.1, stone: 1.5 },
  sellFactor: 0.55,
  buyFactor: 1.6,
};

export const EVENT_INTERVAL: [number, number] = [95, 160];
export const FIRST_EVENT_TICK = 150;
export const AUTOSAVE_MS = 30000;
