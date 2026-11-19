import { SAVE_VERSION } from '../config/balance';
import { BUILDINGS } from '../config/buildings';
import { TECH_BY_ID } from '../config/techs';
import { emptyStats } from './state';
import { RESOURCE_KEYS, type GameState } from './types';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveFile {
  version: number;
  savedAt: number;
  state: GameState;
}

export interface SlotInfo {
  slot: string;
  savedAt: number;
  era: number;
  population: number;
  tick: number;
  seed: string;
}

export const SAVE_PREFIX = 'tinyempires.save.';
export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'] as const;

export function serialize(state: GameState, now = Date.now()): string {
  const file: SaveFile = { version: SAVE_VERSION, savedAt: now, state };
  return JSON.stringify(file);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Parses and validates a save. Throws a readable error for corrupt data. */
export function deserialize(json: string): SaveFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Save data is not valid JSON.');
  }
  const file = raw as Partial<SaveFile>;
  if (!file || typeof file !== 'object' || !file.state) throw new Error('Save data is missing the game state.');
  if (!isNum(file.version) || file.version > SAVE_VERSION) throw new Error('Save was made by a newer version of the game.');
  const s = migrate(file.state as GameState);
  validate(s);
  return { version: SAVE_VERSION, savedAt: isNum(file.savedAt) ? file.savedAt : 0, state: s };
}

/** Fill in fields that older saves may lack. */
function migrate(s: GameState): GameState {
  s.stats = { ...emptyStats(), ...(s.stats ?? {}) };
  s.stats.produced = { ...emptyStats().produced, ...(s.stats.produced ?? {}) };
  s.modifiers ??= [];
  s.eventHistory ??= [];
  s.achievements ??= [];
  s.victory ??= false;
  s.pendingEvent ??= null;
  s.research ??= null;
  s.version = SAVE_VERSION;
  return s;
}

function validate(s: GameState): void {
  const fail = (what: string): never => {
    throw new Error(`Save data is corrupt (${what}).`);
  };
  if (typeof s.seed !== 'string') fail('seed');
  if (!isNum(s.size) || s.size < 16 || s.size > 256) fail('size');
  if (!isNum(s.tick) || !isNum(s.population) || !isNum(s.happiness)) fail('numbers');
  for (const k of RESOURCE_KEYS) if (!isNum(s.resources?.[k])) fail(`resource ${k}`);
  if (!Array.isArray(s.buildings) || !s.buildings.some((b) => b.type === 'townhall')) fail('buildings');
  for (const b of s.buildings) {
    if (!BUILDINGS[b.type]) fail(`building type ${b.type}`);
    if (!isNum(b.x) || !isNum(b.y) || b.x < 0 || b.y < 0 || b.x >= s.size || b.y >= s.size) fail('building position');
    if (!isNum(b.level) || b.level < 1 || b.level > BUILDINGS[b.type].levels.length) fail('building level');
  }
  if (!Array.isArray(s.researched) || s.researched.some((t) => !TECH_BY_ID[t])) fail('research');
}

export function saveToSlot(kv: KeyValueStore, slot: string, state: GameState, now = Date.now()): void {
  kv.setItem(SAVE_PREFIX + slot, serialize(state, now));
}

export function loadFromSlot(kv: KeyValueStore, slot: string): SaveFile | null {
  const json = kv.getItem(SAVE_PREFIX + slot);
  if (!json) return null;
  return deserialize(json);
}

export function slotInfo(kv: KeyValueStore, slot: string): SlotInfo | null {
  try {
    const f = loadFromSlot(kv, slot);
    if (!f) return null;
    return { slot, savedAt: f.savedAt, era: f.state.era, population: f.state.population, tick: f.state.tick, seed: f.state.seed };
  } catch {
    return null;
  }
}

/** localStorage wrapper that never throws (private mode, quota...). */
export function browserStore(): KeyValueStore {
  const mem = new Map<string, string>();
  const ls = (() => {
    try {
      const t = '__te_test__';
      window.localStorage.setItem(t, '1');
      window.localStorage.removeItem(t);
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  return {
    getItem: (k) => (ls ? ls.getItem(k) : (mem.get(k) ?? null)),
    setItem: (k, v) => {
      try {
        if (ls) ls.setItem(k, v);
        else mem.set(k, v);
      } catch {
        mem.set(k, v);
      }
    },
    removeItem: (k) => (ls ? ls.removeItem(k) : mem.delete(k)) as void,
  };
}
