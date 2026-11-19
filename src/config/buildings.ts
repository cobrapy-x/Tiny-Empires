import type { BuildingType, Cost, ResourceKey } from '../core/types';

export type PlacementRule = 'land' | 'farm' | 'nearForest' | 'nearMountain' | 'dock' | 'goldOre' | 'coastal';

export interface LevelDef {
  cost: Cost;
  /** Construction / upgrade time in ticks. */
  time: number;
  housing?: number;
  workers?: number;
  produces?: Partial<Record<ResourceKey, number>>;
  upkeep?: Partial<Record<ResourceKey, number>>;
  storage?: number;
  happiness?: number;
  requiresTech?: string;
  requiresEra?: number;
}

export interface BuildingDef {
  type: BuildingType;
  name: string;
  description: string;
  placement: PlacementRule;
  placementHint: string;
  unlockTech?: string;
  unlockEra?: number;
  limit?: number;
  buildable: boolean;
  levels: LevelDef[];
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  townhall: {
    type: 'townhall',
    name: 'Town Hall',
    description: 'Heart of your settlement. Houses settlers, stores goods and produces a little of everything.',
    placement: 'land',
    placementHint: '',
    buildable: false,
    limit: 1,
    levels: [
      { cost: {}, time: 0, housing: 6, storage: 250, produces: { food: 0.35, wood: 0.25, gold: 0.15, knowledge: 0.1 } },
      { cost: { wood: 100, stone: 80, gold: 60 }, time: 30, requiresEra: 2, housing: 10, storage: 500, happiness: 3, produces: { food: 0.45, wood: 0.35, gold: 0.3, knowledge: 0.25 } },
      { cost: { wood: 220, stone: 220, gold: 180 }, time: 45, requiresEra: 3, requiresTech: 'architecture', housing: 14, storage: 800, happiness: 6, produces: { food: 0.55, wood: 0.45, gold: 0.5, knowledge: 0.4 } },
    ],
  },
  house: {
    type: 'house',
    name: 'House',
    description: 'Homes for your people. More housing lets the population grow.',
    placement: 'land',
    placementHint: 'Any dry land (grass, desert, beach).',
    buildable: true,
    levels: [
      { cost: { wood: 24 }, time: 8, housing: 5 },
      { cost: { wood: 15, stone: 20 }, time: 12, housing: 9, requiresTech: 'masonry' },
      { cost: { wood: 25, stone: 35, gold: 20 }, time: 16, housing: 14, requiresTech: 'architecture' },
    ],
  },
  farm: {
    type: 'farm',
    name: 'Farm',
    description: 'Grows food. +40% next to a river; deserts yield half until Irrigation.',
    placement: 'farm',
    placementHint: 'Grassland or desert. Rivers boost yield.',
    buildable: true,
    levels: [
      { cost: { wood: 25 }, time: 10, workers: 2, produces: { food: 1.0 } },
      { cost: { wood: 25, stone: 15 }, time: 12, workers: 3, produces: { food: 1.8 }, requiresTech: 'irrigation' },
      { cost: { wood: 30, stone: 25, gold: 20 }, time: 16, workers: 4, produces: { food: 2.7 }, requiresTech: 'croprotation' },
    ],
  },
  lumbermill: {
    type: 'lumbermill',
    name: 'Lumber Mill',
    description: 'Cuts wood from adjacent forest tiles. More forest = more wood.',
    placement: 'nearForest',
    placementHint: 'Next to at least one forest tile.',
    buildable: true,
    levels: [
      { cost: { wood: 20 }, time: 10, workers: 2, produces: { wood: 0.55 } },
      { cost: { wood: 30, stone: 20 }, time: 12, workers: 3, produces: { wood: 1.05 }, requiresTech: 'tools' },
    ],
  },
  quarry: {
    type: 'quarry',
    name: 'Quarry',
    description: 'Cuts stone from adjacent mountains. More mountain = more stone.',
    placement: 'nearMountain',
    placementHint: 'Next to at least one mountain tile.',
    buildable: true,
    levels: [
      { cost: { wood: 30 }, time: 12, workers: 2, produces: { stone: 0.4 } },
      { cost: { wood: 30, stone: 20, gold: 10 }, time: 14, workers: 3, produces: { stone: 0.8 }, requiresTech: 'tools' },
    ],
  },
  market: {
    type: 'market',
    name: 'Market',
    description: 'Earns gold, keeps people happy and lets you trade goods for gold.',
    placement: 'land',
    placementHint: 'Any dry land.',
    unlockTech: 'bartering',
    buildable: true,
    levels: [
      { cost: { wood: 40, stone: 20 }, time: 15, workers: 2, produces: { gold: 0.6 }, happiness: 4 },
      { cost: { wood: 40, stone: 40, gold: 40 }, time: 20, workers: 3, produces: { gold: 1.3 }, happiness: 7, requiresTech: 'currency' },
    ],
  },
  school: {
    type: 'school',
    name: 'School',
    description: 'Produces knowledge for research. Costs gold upkeep.',
    placement: 'land',
    placementHint: 'Any dry land.',
    buildable: true,
    levels: [
      { cost: { wood: 40, stone: 20, gold: 15 }, time: 15, workers: 2, produces: { knowledge: 0.5 }, upkeep: { gold: 0.1 } },
      { cost: { wood: 40, stone: 40, gold: 40 }, time: 20, workers: 3, produces: { knowledge: 1.1 }, upkeep: { gold: 0.2 }, requiresTech: 'writing' },
      { cost: { wood: 60, stone: 80, gold: 80 }, time: 25, workers: 4, produces: { knowledge: 2.0 }, upkeep: { gold: 0.35 }, requiresTech: 'academia' },
    ],
  },
  warehouse: {
    type: 'warehouse',
    name: 'Warehouse',
    description: 'Raises the storage limit of food, wood, stone and gold.',
    placement: 'land',
    placementHint: 'Any dry land.',
    buildable: true,
    levels: [
      { cost: { wood: 45, stone: 15 }, time: 12, workers: 1, storage: 200 },
      { cost: { wood: 50, stone: 50 }, time: 15, workers: 1, storage: 450, requiresTech: 'architecture' },
    ],
  },
  dock: {
    type: 'dock',
    name: 'Fishing Dock',
    description: 'Catches fish from nearby water. Works best facing open sea.',
    placement: 'dock',
    placementHint: 'On a beach next to the sea.',
    unlockTech: 'fishing',
    buildable: true,
    levels: [
      { cost: { wood: 30 }, time: 12, workers: 2, produces: { food: 1.2 } },
      { cost: { wood: 40, stone: 20, gold: 20 }, time: 15, workers: 3, produces: { food: 2.3, gold: 0.3 }, requiresTech: 'navigation' },
    ],
  },
  goldmine: {
    type: 'goldmine',
    name: 'Gold Mine',
    description: 'Digs gold out of a mountain with a visible gold vein.',
    placement: 'goldOre',
    placementHint: 'On a mountain tile with a gold vein (sparkles).',
    unlockTech: 'mining',
    buildable: true,
    levels: [
      { cost: { wood: 40, stone: 40 }, time: 18, workers: 3, produces: { gold: 1.0 } },
      { cost: { wood: 50, stone: 60, gold: 30 }, time: 20, workers: 4, produces: { gold: 1.9 }, requiresTech: 'architecture' },
    ],
  },
  temple: {
    type: 'temple',
    name: 'Temple',
    description: 'A place of calm. Greatly improves happiness. Costs gold upkeep.',
    placement: 'land',
    placementHint: 'Any dry land.',
    unlockTech: 'mysticism',
    buildable: true,
    levels: [
      { cost: { stone: 50, gold: 30 }, time: 18, workers: 1, happiness: 8, produces: { knowledge: 0.1 }, upkeep: { gold: 0.15 } },
      { cost: { stone: 80, gold: 60 }, time: 22, workers: 2, happiness: 14, produces: { knowledge: 0.2 }, upkeep: { gold: 0.25 }, requiresTech: 'medicine' },
    ],
  },
  lighthouse: {
    type: 'lighthouse',
    name: 'Grand Lighthouse',
    description: 'A wonder that guides ships to your island. Completing it wins the game!',
    placement: 'coastal',
    placementHint: 'Dry land next to the sea.',
    unlockTech: 'engineering',
    unlockEra: 4,
    limit: 1,
    buildable: true,
    levels: [{ cost: { wood: 700, stone: 900, gold: 600 }, time: 120, happiness: 10 }],
  },
};

export const BUILD_ORDER: BuildingType[] = [
  'house', 'farm', 'lumbermill', 'quarry', 'warehouse', 'school', 'market', 'dock', 'goldmine', 'temple', 'lighthouse',
];
