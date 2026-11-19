import { FIRST_EVENT_TICK, SAVE_VERSION, START } from '../config/balance';
import { BUILDINGS } from '../config/buildings';
import { hashString } from './rng';
import { generateWorld, WORLD_SIZES } from './world';
import type { GameState, Stats, World } from './types';

export function emptyStats(): Stats {
  return {
    produced: { food: 0, wood: 0, stone: 0, gold: 0, knowledge: 0 },
    buildingsBuilt: 0,
    upgradesDone: 0,
    eventsResolved: 0,
    trades: 0,
    peakPopulation: START.population,
    peakHappiness: START.happiness,
    starvationTicks: 0,
  };
}

/** Create a brand-new game: world + initial state with a Town Hall at the start tile. */
export function createGame(seed: string, size: number = WORLD_SIZES.medium): { state: GameState; world: World } {
  const world = generateWorld(seed, size);
  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    size,
    tick: 0,
    resources: { food: START.food, wood: START.wood, stone: START.stone, gold: START.gold, knowledge: START.knowledge },
    population: START.population,
    popProgress: 0,
    happiness: START.happiness,
    taxRate: 1,
    buildings: [
      {
        id: 1,
        type: 'townhall',
        x: world.start.x,
        y: world.start.y,
        level: 1,
        construction: 0,
        constructionTotal: BUILDINGS.townhall.levels[0].time,
        upgradeTo: 0,
      },
    ],
    nextId: 2,
    researched: [],
    research: null,
    era: 1,
    modifiers: [],
    pendingEvent: null,
    nextEventTick: FIRST_EVENT_TICK,
    eventHistory: [],
    rng: hashString(seed) ^ 0xa5a5a5a5,
    stats: emptyStats(),
    achievements: [],
    victory: false,
  };
  return { state, world };
}
