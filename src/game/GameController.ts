/**
 * Owns the authoritative game state and runs the fixed-step simulation.
 * UI and renderer talk to the game exclusively through this controller.
 */
import { AUTOSAVE_MS, SPEEDS } from '../config/balance';
import { BUILDINGS } from '../config/buildings';
import { ERAS } from '../config/eras';
import { TECH_BY_ID } from '../config/techs';
import { ACHIEVEMENTS } from '../config/achievements';
import {
  buildingAt,
  demolish,
  placeBuilding,
  startUpgrade,
  type CheckResult,
} from '../core/buildingSystem';
import { computeEconomy, type EconomyReport } from '../core/economy';
import { resolveEvent } from '../core/events';
import { startResearch } from '../core/research';
import { browserStore, deserialize, loadFromSlot, saveToSlot, serialize, type KeyValueStore } from '../core/save';
import { tick } from '../core/simulation';
import { createGame } from '../core/state';
import { trade, type Tradable } from '../core/trade';
import type { BuildingType, GameMessage, GameState, World } from '../core/types';
import { generateWorld } from '../core/world';
import { Emitter } from './Emitter';
import { Meta } from './Meta';

export interface Selection {
  x: number;
  y: number;
}

export type ToastKind = 'info' | 'good' | 'bad' | 'achievement' | 'era';

export interface ControllerEvents {
  /** Fired after each simulation tick (possibly several per frame). */
  tick: GameMessage[];
  /** Any state change that should refresh the UI. */
  changed: void;
  /** A whole new world was loaded/created; renderer must rebuild. */
  world: void;
  select: Selection | null;
  buildMode: BuildingType | null;
  speed: number;
  toast: { text: string; kind: ToastKind };
  /** Positional feedback (floating text over a tile). */
  float: { x: number; y: number; text: string; color: string };
  action: { kind: 'place' | 'upgrade' | 'demolish' | 'error' | 'click' | 'coin' | 'research'; x?: number; y?: number };
}

export class GameController {
  state!: GameState;
  world!: World;
  report!: EconomyReport;
  readonly bus = new Emitter<ControllerEvents>();
  readonly meta: Meta;
  speedIndex = 1;
  private lastSpeedIndex = 1;
  private acc = 0;
  private autosaveTimer = 0;
  selection: Selection | null = null;
  buildMode: BuildingType | null = null;

  constructor(private store: KeyValueStore = browserStore()) {
    this.meta = new Meta(store);
  }

  get speed(): number {
    return SPEEDS[this.speedIndex];
  }

  get paused(): boolean {
    return this.speed === 0 || !!this.state.pendingEvent;
  }

  newGame(seed: string, size: number): void {
    const { state, world } = createGame(seed, size);
    this.adopt(state, world);
    this.meta.data.gamesStarted++;
    this.meta.save();
  }

  /** Load the given slot; returns an error string on failure. */
  loadSlot(slot: string): string | null {
    try {
      const file = loadFromSlot(this.store, slot);
      if (!file) return 'That save slot is empty.';
      this.adopt(file.state, generateWorld(file.state.seed, file.state.size));
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }

  importSave(json: string): string | null {
    try {
      const file = deserialize(json);
      this.adopt(file.state, generateWorld(file.state.seed, file.state.size));
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }

  exportSave(): string {
    return serialize(this.state);
  }

  saveSlot(slot: string): void {
    saveToSlot(this.store, slot, this.state);
    this.meta.recordStats(this.state);
  }

  private adopt(state: GameState, world: World): void {
    this.state = state;
    this.world = world;
    this.selection = null;
    this.buildMode = null;
    this.acc = 0;
    this.meta.resetTick(state.tick);
    this.refresh();
    this.bus.emit('world', undefined);
    this.bus.emit('select', null);
    this.bus.emit('buildMode', null);
    this.bus.emit('changed', undefined);
  }

  refresh(): void {
    this.report = computeEconomy(this.state, this.world);
  }

  /** Called every animation frame with elapsed milliseconds. */
  update(dtMs: number): void {
    this.autosaveTimer += dtMs;
    if (this.autosaveTimer >= AUTOSAVE_MS) {
      this.autosaveTimer = 0;
      if (this.meta.settings.autosave) this.saveSlot('auto');
    }
    if (this.paused) return;
    this.acc += Math.min(dtMs, 250) * this.speed;
    let ticks = 0;
    while (this.acc >= 1000 && ticks < 8) {
      this.acc -= 1000;
      ticks++;
      const msgs = tick(this.state, this.world);
      this.handleMessages(msgs);
      this.bus.emit('tick', msgs);
      if (this.state.pendingEvent) {
        this.acc = 0;
        break;
      }
    }
    if (ticks > 0) {
      this.refresh();
      this.bus.emit('changed', undefined);
    }
  }

  /** Fraction (0..1) of progress toward the next tick — used for smooth animations. */
  get tickFraction(): number {
    return this.acc / 1000;
  }

  private handleMessages(msgs: GameMessage[]): void {
    for (const m of msgs) {
      switch (m.kind) {
        case 'built':
          this.bus.emit('float', { x: m.building.x, y: m.building.y, text: `${BUILDINGS[m.building.type].name} built!`, color: '#fff3b0' });
          break;
        case 'upgraded':
          this.bus.emit('float', { x: m.building.x, y: m.building.y, text: `Level ${m.building.level}!`, color: '#b8f5ff' });
          break;
        case 'researched':
          this.bus.emit('toast', { text: `Research complete: ${TECH_BY_ID[m.techId].name}`, kind: 'good' });
          this.bus.emit('action', { kind: 'research' });
          break;
        case 'era':
          this.bus.emit('toast', { text: `A new era begins: ${ERAS[m.era - 1].name}!`, kind: 'era' });
          break;
        case 'achievement': {
          const a = ACHIEVEMENTS.find((x) => x.id === m.id);
          if (a && this.meta.unlock(a.id)) this.bus.emit('toast', { text: `Achievement unlocked: ${a.name}`, kind: 'achievement' });
          break;
        }
        case 'victory':
          this.meta.data.victories++;
          this.meta.save();
          this.saveSlot('auto');
          break;
        case 'popChange':
          if (m.delta < 0) this.bus.emit('toast', { text: `${-m.delta} ${-m.delta === 1 ? 'person has' : 'people have'} left your settlement.`, kind: 'bad' });
          break;
        default:
          break;
      }
    }
  }

  // ---- Player actions ------------------------------------------------------

  private result(r: CheckResult, x?: number, y?: number): CheckResult {
    if (!r.ok) {
      this.bus.emit('toast', { text: r.reason ?? 'Not possible.', kind: 'bad' });
      this.bus.emit('action', { kind: 'error', x, y });
    }
    this.refresh();
    this.bus.emit('changed', undefined);
    return r;
  }

  setSpeed(index: number): void {
    this.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, index));
    if (this.speedIndex > 0) this.lastSpeedIndex = this.speedIndex;
    this.bus.emit('speed', this.speedIndex);
  }

  togglePause(): void {
    this.setSpeed(this.speedIndex === 0 ? this.lastSpeedIndex : 0);
  }

  setBuildMode(type: BuildingType | null): void {
    this.buildMode = type;
    if (type) this.select(null);
    this.bus.emit('buildMode', type);
  }

  select(sel: Selection | null): void {
    this.selection = sel;
    this.bus.emit('select', sel);
  }

  /** Main click handler for a tile. */
  clickTile(x: number, y: number): void {
    if (this.buildMode) {
      this.place(this.buildMode, x, y);
      return;
    }
    this.select({ x, y });
    this.bus.emit('action', { kind: 'click' });
  }

  place(type: BuildingType, x: number, y: number): CheckResult {
    const r = placeBuilding(this.state, this.world, type, x, y);
    if (r.ok) {
      this.bus.emit('action', { kind: 'place', x, y });
      // Stop building limited structures after placement.
      if (BUILDINGS[type].limit === 1) this.setBuildMode(null);
    }
    return this.result(r, x, y);
  }

  upgradeAt(x: number, y: number): CheckResult {
    const b = buildingAt(this.state, x, y);
    if (!b) return this.result({ ok: false, reason: 'Nothing to upgrade.' });
    const r = startUpgrade(this.state, b);
    if (r.ok) this.bus.emit('action', { kind: 'upgrade', x, y });
    return this.result(r, x, y);
  }

  demolishAt(x: number, y: number): CheckResult {
    const b = buildingAt(this.state, x, y);
    if (!b) return this.result({ ok: false, reason: 'Nothing to demolish.' });
    const r = demolish(this.state, b);
    if (r.ok) this.bus.emit('action', { kind: 'demolish', x, y });
    return this.result(r, x, y);
  }

  research(id: string): CheckResult {
    const r = startResearch(this.state, id);
    if (r.ok) this.bus.emit('action', { kind: 'research' });
    return this.result(r);
  }

  setTax(rate: 0 | 1 | 2): void {
    this.state.taxRate = rate;
    this.refresh();
    this.bus.emit('changed', undefined);
  }

  trade(res: Tradable, side: 'buy' | 'sell'): CheckResult {
    const r = trade(this.state, this.world, res, side);
    if (r.ok) this.bus.emit('action', { kind: 'coin' });
    return this.result(r);
  }

  chooseEvent(index: number): CheckResult {
    const r = resolveEvent(this.state, this.world, index);
    if (r.ok && 'text' in r && r.text) this.bus.emit('toast', { text: r.text, kind: 'info' });
    return this.result(r);
  }
}
