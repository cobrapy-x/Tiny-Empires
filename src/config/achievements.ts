import type { GameState } from '../core/types';
import { TECHS } from './techs';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  check: (s: GameState) => boolean;
}

const count = (s: GameState, type: string): number => s.buildings.filter((b) => b.type === type && b.construction === 0).length;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_build', name: 'Groundbreaking', description: 'Complete your first building.', check: (s) => s.stats.buildingsBuilt >= 1 },
  { id: 'scholar', name: 'Scholar', description: 'Research your first technology.', check: (s) => s.researched.length >= 1 },
  { id: 'breadbasket', name: 'Breadbasket', description: 'Have 5 farms at once.', check: (s) => count(s, 'farm') >= 5 },
  { id: 'lumberjack', name: 'Lumberjack', description: 'Produce 1,000 wood in one game.', check: (s) => s.stats.produced.wood >= 1000 },
  { id: 'stonecutter', name: 'Stonecutter', description: 'Produce 1,000 stone in one game.', check: (s) => s.stats.produced.stone >= 1000 },
  { id: 'village', name: 'Village Elder', description: 'Reach the Village era.', check: (s) => s.era >= 2 },
  { id: 'town', name: 'Town Founder', description: 'Reach the Town era.', check: (s) => s.era >= 3 },
  { id: 'city', name: 'City Planner', description: 'Reach the City era.', check: (s) => s.era >= 4 },
  { id: 'empire', name: 'Emperor', description: 'Complete the Grand Lighthouse.', check: (s) => s.victory },
  { id: 'joyful', name: 'Joyful People', description: 'Reach 90 happiness.', check: (s) => s.happiness >= 90 },
  { id: 'bustling', name: 'Bustling', description: 'Reach a population of 100.', check: (s) => s.population >= 100 },
  { id: 'merchant', name: 'Merchant Prince', description: 'Make 20 trades.', check: (s) => s.stats.trades >= 20 },
  { id: 'steady', name: 'Steady Hand', description: 'Resolve 10 events.', check: (s) => s.stats.eventsResolved >= 10 },
  { id: 'builder', name: 'Master Builder', description: 'Complete 40 buildings in one game.', check: (s) => s.stats.buildingsBuilt >= 40 },
  { id: 'treasury', name: 'Royal Treasury', description: 'Hold 1,000 gold at once.', check: (s) => s.resources.gold >= 1000 },
  { id: 'grand_hall', name: 'Grand Hall', description: 'Upgrade the Town Hall to level 3.', check: (s) => s.buildings.some((b) => b.type === 'townhall' && b.level >= 3) },
  { id: 'enlightened', name: 'Enlightened', description: 'Research every technology.', check: (s) => s.researched.length >= TECHS.length },
  { id: 'well_fed', name: 'Never Hungry', description: 'Reach the Town era without anyone starving.', check: (s) => s.era >= 3 && s.stats.starvationTicks === 0 },
  { id: 'swift', name: 'Swift Empire', description: 'Win within 45 in-game minutes.', check: (s) => s.victory && s.tick <= 2700 },
];

/** Returns ids of achievements newly unlocked this check (and records them on the state). */
export function checkAchievements(s: GameState): string[] {
  const out: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (!s.achievements.includes(a.id) && a.check(s)) {
      s.achievements.push(a.id);
      out.push(a.id);
    }
  }
  return out;
}
