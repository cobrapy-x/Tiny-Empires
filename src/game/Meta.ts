/** Persistent, cross-game data: settings, unlocked achievements, lifetime stats. */
import type { KeyValueStore } from '../core/save';
import type { GameState } from '../core/types';

export interface Settings {
  music: number;
  sfx: number;
  autosave: boolean;
  tutorialDone: boolean;
  tutorialStep: number;
  reducedMotion: boolean;
  uiScale: number;
}

export interface MetaData {
  achievements: string[];
  gamesStarted: number;
  victories: number;
  bestPopulation: number;
  totalPlayTicks: number;
  settings: Settings;
}

const KEY = 'tinyempires.meta';

export const DEFAULT_SETTINGS: Settings = {
  music: 0.5,
  sfx: 0.7,
  autosave: true,
  tutorialDone: false,
  tutorialStep: 0,
  reducedMotion: false,
  uiScale: 1,
};

export class Meta {
  data: MetaData;
  private lastTick = 0;

  constructor(private store: KeyValueStore) {
    this.data = this.load();
  }

  get settings(): Settings {
    return this.data.settings;
  }

  private load(): MetaData {
    const base: MetaData = { achievements: [], gamesStarted: 0, victories: 0, bestPopulation: 0, totalPlayTicks: 0, settings: { ...DEFAULT_SETTINGS } };
    try {
      const raw = this.store.getItem(KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw) as Partial<MetaData>;
      return { ...base, ...parsed, settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) } };
    } catch {
      return base;
    }
  }

  save(): void {
    this.store.setItem(KEY, JSON.stringify(this.data));
  }

  /** Returns true if this is the first time the achievement is unlocked (globally). */
  unlock(id: string): boolean {
    if (this.data.achievements.includes(id)) return false;
    this.data.achievements.push(id);
    this.save();
    return true;
  }

  recordStats(state: GameState): void {
    this.data.bestPopulation = Math.max(this.data.bestPopulation, state.stats.peakPopulation);
    if (state.tick > this.lastTick) this.data.totalPlayTicks += state.tick - this.lastTick;
    this.lastTick = state.tick;
    this.save();
  }

  resetTick(tick: number): void {
    this.lastTick = tick;
  }
}
