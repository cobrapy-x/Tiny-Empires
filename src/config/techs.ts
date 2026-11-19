export interface TechEffects {
  /** Multipliers applied to resource production (e.g. { wood: 0.15 } = +15%). */
  production?: Partial<Record<'food' | 'wood' | 'stone' | 'gold' | 'knowledge' | 'all', number>>;
  happiness?: number;
  growth?: number;
  taxBonus?: number;
  tradeBonus?: number;
  desertFarms?: boolean;
}

export interface TechDef {
  id: string;
  name: string;
  tier: number;
  cost: number;
  time: number;
  requires: string[];
  description: string;
  effects?: TechEffects;
}

export const TECHS: TechDef[] = [
  // Tier 1 — Hamlet
  { id: 'bartering', name: 'Bartering', tier: 1, cost: 30, time: 20, requires: [], description: 'Unlocks the Market and trading.' },
  { id: 'fishing', name: 'Fishing', tier: 1, cost: 25, time: 15, requires: [], description: 'Unlocks the Fishing Dock.' },
  { id: 'tools', name: 'Tools', tier: 1, cost: 40, time: 25, requires: [], description: 'Lumber Mill & Quarry upgrades. +15% wood and stone.', effects: { production: { wood: 0.15, stone: 0.15 } } },
  { id: 'masonry', name: 'Masonry', tier: 1, cost: 45, time: 25, requires: [], description: 'Stone houses (House Lv2). +10% stone.', effects: { production: { stone: 0.1 } } },
  // Tier 2 — Village
  { id: 'irrigation', name: 'Irrigation', tier: 2, cost: 90, time: 35, requires: ['tools'], description: 'Farm Lv2. Desert farms yield fully.', effects: { desertFarms: true } },
  { id: 'mining', name: 'Mining', tier: 2, cost: 100, time: 40, requires: ['masonry'], description: 'Unlocks the Gold Mine.' },
  { id: 'writing', name: 'Writing', tier: 2, cost: 90, time: 35, requires: ['bartering'], description: 'School Lv2. +10% knowledge.', effects: { production: { knowledge: 0.1 } } },
  { id: 'mysticism', name: 'Mysticism', tier: 2, cost: 80, time: 30, requires: ['masonry'], description: 'Unlocks the Temple.' },
  // Tier 3 — Town
  { id: 'currency', name: 'Currency', tier: 3, cost: 180, time: 50, requires: ['bartering', 'writing'], description: 'Market Lv2. Taxes +25%, better trade prices.', effects: { taxBonus: 0.25, tradeBonus: 0.1 } },
  { id: 'architecture', name: 'Architecture', tier: 3, cost: 200, time: 55, requires: ['masonry', 'mining'], description: 'House Lv3, Town Hall Lv3, Warehouse & Gold Mine Lv2.' },
  { id: 'croprotation', name: 'Crop Rotation', tier: 3, cost: 170, time: 45, requires: ['irrigation'], description: 'Farm Lv3. +10% food.', effects: { production: { food: 0.1 } } },
  { id: 'academia', name: 'Academia', tier: 3, cost: 230, time: 60, requires: ['writing'], description: 'School Lv3. +10% knowledge.', effects: { production: { knowledge: 0.1 } } },
  // Tier 4 — City
  { id: 'engineering', name: 'Engineering', tier: 4, cost: 380, time: 80, requires: ['architecture', 'academia'], description: 'Unlocks the Grand Lighthouse. +10% all production.', effects: { production: { all: 0.1 } } },
  { id: 'medicine', name: 'Medicine', tier: 4, cost: 320, time: 70, requires: ['academia', 'mysticism'], description: 'Temple Lv2. Faster growth, +5 happiness.', effects: { growth: 0.3, happiness: 5 } },
  { id: 'navigation', name: 'Navigation', tier: 4, cost: 300, time: 60, requires: ['fishing', 'currency'], description: 'Fishing Dock Lv2. Much better trade prices.', effects: { tradeBonus: 0.15 } },
];

export const TECH_BY_ID: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));
