/** Shared type definitions for the simulation. No runtime code here. */

export type ResourceKey = 'food' | 'wood' | 'stone' | 'gold' | 'knowledge';
export type StoredResource = 'food' | 'wood' | 'stone' | 'gold';
export type Resources = Record<ResourceKey, number>;
export type Cost = Partial<Record<ResourceKey, number>>;

export const RESOURCE_KEYS: readonly ResourceKey[] = ['food', 'wood', 'stone', 'gold', 'knowledge'];
export const STORED_RESOURCES: readonly StoredResource[] = ['food', 'wood', 'stone', 'gold'];

export enum Terrain {
  Deep = 0,
  Shallow = 1,
  Beach = 2,
  Grass = 3,
  Forest = 4,
  Mountain = 5,
  Desert = 6,
  River = 7,
}

export type BuildingType =
  | 'townhall'
  | 'house'
  | 'farm'
  | 'lumbermill'
  | 'quarry'
  | 'market'
  | 'school'
  | 'warehouse'
  | 'dock'
  | 'goldmine'
  | 'temple'
  | 'lighthouse';

export interface World {
  seed: string;
  size: number;
  terrain: Uint8Array;
  elevation: Float32Array;
  goldOre: Uint8Array;
  start: { x: number; y: number };
}

export interface Building {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  /** Current operating level (1-based). */
  level: number;
  /** Remaining construction ticks; 0 when finished. */
  construction: number;
  constructionTotal: number;
  /** When > 0 the building is being upgraded to this level (keeps working meanwhile). */
  upgradeTo: number;
}

export type ModifierKind =
  | 'foodMul'
  | 'woodStoneMul'
  | 'goldMul'
  | 'knowledgeMul'
  | 'allMul'
  | 'happiness'
  | 'consumptionMul'
  | 'growthMul';

export interface Modifier {
  kind: ModifierKind;
  value: number;
  remaining: number;
  label: string;
}

export interface PendingEvent {
  id: string;
  /** Numbers rolled when the event fired (e.g. trade amounts). */
  data: Record<string, number>;
}

export interface Stats {
  produced: Record<ResourceKey, number>;
  buildingsBuilt: number;
  upgradesDone: number;
  eventsResolved: number;
  trades: number;
  peakPopulation: number;
  peakHappiness: number;
  starvationTicks: number;
}

export interface GameState {
  version: number;
  seed: string;
  size: number;
  tick: number;
  resources: Resources;
  population: number;
  /** Fractional growth/decline accumulator. */
  popProgress: number;
  happiness: number;
  taxRate: 0 | 1 | 2;
  buildings: Building[];
  nextId: number;
  researched: string[];
  research: { id: string; remaining: number; total: number } | null;
  era: number;
  modifiers: Modifier[];
  pendingEvent: PendingEvent | null;
  nextEventTick: number;
  eventHistory: string[];
  rng: number;
  stats: Stats;
  achievements: string[];
  victory: boolean;
}

/** Messages emitted by the simulation for UI/audio feedback. */
export type GameMessage =
  | { kind: 'built'; building: Building }
  | { kind: 'upgraded'; building: Building }
  | { kind: 'researched'; techId: string }
  | { kind: 'era'; era: number }
  | { kind: 'event'; eventId: string }
  | { kind: 'achievement'; id: string }
  | { kind: 'popChange'; delta: number }
  | { kind: 'warning'; text: string }
  | { kind: 'victory' };
