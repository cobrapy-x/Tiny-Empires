import { DAY_LENGTH, SPEEDS } from '../config/balance';
import { ERAS } from '../config/eras';
import { nextEraProgress } from '../core/progression';
import type { ResourceKey } from '../core/types';
import type { GameController } from '../game/GameController';
import type { IconName } from '../render/sprites';
import { $, clear, fmt, fmtRate, h, icon } from './dom';
import { tapTip } from './widgets';

interface ResSlot {
  root: HTMLElement;
  val: HTMLElement;
  cap?: HTMLElement;
  rate?: HTMLElement;
}

const NAMES: Record<string, string> = {
  food: 'Food',
  wood: 'Wood',
  stone: 'Stone',
  gold: 'Gold',
  knowledge: 'Knowledge',
  population: 'Population',
  happiness: 'Happiness',
};

export class Hud {
  private slots = new Map<string, ResSlot>();
  private speedBtns: HTMLButtonElement[] = [];

  constructor(private ctrl: GameController, onGoals: () => void) {
    const root = $('#resources');
    root.classList.add('panel');
    const keys: IconName[] = ['food', 'wood', 'stone', 'gold', 'knowledge', 'population', 'happiness'];
    for (const k of keys) {
      const val = h('span', { class: 'val' });
      const showCap = ['food', 'wood', 'stone', 'gold', 'population'].includes(k);
      const cap = showCap ? h('span', { class: 'cap' }) : undefined;
      const rate = k !== 'population' ? h('span', { class: 'rate' }) : undefined;
      const el = h('div', { class: 'res', attrs: { 'aria-label': NAMES[k] } }, icon(k, 18), val, cap, rate);
      root.append(el);
      this.slots.set(k, { root: el, val, cap, rate });
      tapTip(el, () => this.tooltip(k));
    }

    const speed = $('#speed');
    SPEEDS.forEach((s, i) => {
      const b = h('button', {
        class: 'speed-btn',
        text: s === 0 ? '⏸' : `${s}×`,
        title: s === 0 ? 'Pause (Space)' : `Speed ${s}× (key ${i})`,
        attrs: { 'aria-label': s === 0 ? 'Pause' : `Speed ${s} times` },
        onclick: () => ctrl.setSpeed(i),
      });
      this.speedBtns.push(b);
      speed.append(b);
    });
    $('#top-right').classList.add('panel');
    const tracker = $('#goal-tracker');
    tracker.classList.add('panel');
    tracker.addEventListener('click', onGoals);
    tracker.addEventListener('keydown', (e) => e.key === 'Enter' && onGoals());

    ctrl.bus.on('speed', () => this.renderSpeed());
    this.renderSpeed();
  }

  renderSpeed(): void {
    this.speedBtns.forEach((b, i) => b.classList.toggle('active', i === this.ctrl.speedIndex));
  }

  update(): void {
    const { state, report } = this.ctrl;
    const set = (k: string, v: string, cap?: string, rate?: number, full = false, alert = false): void => {
      const s = this.slots.get(k)!;
      s.val.textContent = v;
      if (s.cap) s.cap.textContent = cap ?? '';
      if (s.rate && rate !== undefined) {
        s.rate.textContent = fmtRate(rate);
        s.rate.className = `rate ${rate > 0.004 ? 'pos' : rate < -0.004 ? 'neg' : ''}`;
      }
      s.root.classList.toggle('full', full);
      s.root.classList.toggle('alert', alert);
    };
    for (const k of ['food', 'wood', 'stone', 'gold'] as const) {
      const v = state.resources[k];
      set(k, fmt(v), `/${fmt(report.storage)}`, report.net[k], v >= report.storage - 0.5, k === 'food' && v < 1 && report.net.food < 0);
    }
    set('knowledge', fmt(state.resources.knowledge), undefined, report.net.knowledge);
    set('population', `${state.population}`, `/${report.housing}`, undefined, state.population >= report.housing, state.population > report.housing);
    const hDiff = report.happinessTarget - state.happiness;
    set('happiness', `${Math.round(state.happiness)}`, undefined, undefined, false, state.happiness < 25);
    const hs = this.slots.get('happiness')!;
    hs.rate!.textContent = Math.abs(hDiff) < 0.5 ? '' : `${hDiff > 0 ? '▲' : '▼'} ${Math.round(report.happinessTarget)}`;
    hs.rate!.className = `rate ${hDiff > 0.5 ? 'pos' : hDiff < -0.5 ? 'neg' : ''}`;

    const day = Math.floor(state.tick / DAY_LENGTH) + 1;
    $('#clock').innerHTML = `<b>${ERAS[state.era - 1].name}</b><br>Day ${day}`;
    this.renderTracker();
  }

  private renderTracker(): void {
    const el = $('#goal-tracker');
    const next = nextEraProgress(this.ctrl.state);
    clear(el);
    if (!next) {
      el.append(h('div', { class: 'title', text: '🏆 Empire complete!' }), h('div', { class: 'muted', text: 'Keep building your legacy.' }));
      return;
    }
    el.append(h('div', { class: 'title', text: `Next era: ${next.name}` }));
    for (const r of next.reqs) {
      el.append(
        h('div', { class: `req${r.met ? ' met' : ''}` }, h('span', { text: `${r.met ? '✓ ' : ''}${r.label}` }), h('span', { text: `${r.current}/${r.target}` })),
        h('div', { class: 'bar' }, h('i', { style: `width:${Math.round((r.current / r.target) * 100)}%` })),
      );
    }
  }

  private tooltip(k: string): string {
    const { state, report } = this.ctrl;
    const lines = (arr: { label: string; value: number }[], unit = '/s'): string =>
      arr
        .map((l) => `<div class="line"><span>${l.label}</span><span class="${l.value >= 0 ? 'pos' : 'neg'}">${l.value >= 0 ? '+' : ''}${l.value.toFixed(2)}${unit}</span></div>`)
        .join('');
    if (k === 'population') {
      const unemployed = state.population - report.employed;
      return `<h4>Population ${state.population} / ${report.housing} housing</h4>
        <div class="line"><span>Jobs filled</span><span>${report.employed} / ${report.jobs}</span></div>
        <div class="line"><span>Workforce efficiency</span><span>${Math.round(report.workforce * 100)}%</span></div>
        ${unemployed > 0 ? `<div class="line"><span>Unemployed</span><span>${unemployed}</span></div>` : ''}
        <p class="muted">People grow when there is free housing, food in store and happiness ≥ 35. Each person eats food and pays taxes. Buildings need workers to run at full speed.</p>`;
    }
    if (k === 'happiness') {
      return `<h4>Happiness ${Math.round(state.happiness)} → ${Math.round(report.happinessTarget)}</h4>${lines(report.happinessFactors, '')}
        <p class="muted">Above 65 production gets a bonus; below 35 it suffers and growth stops. Below 22 people leave.</p>`;
    }
    const key = k as ResourceKey;
    const desc: Record<ResourceKey, string> = {
      food: 'Eaten by your people. Running out causes starvation.',
      wood: 'Used for almost every building.',
      stone: 'Needed for sturdier buildings and upgrades.',
      gold: 'Earned from taxes, markets and mines. Pays building upkeep.',
      knowledge: 'Spent on research. Produced by schools, temples and the Town Hall.',
    };
    return `<h4>${NAMES[k]} ${fmt(state.resources[key])}${key !== 'knowledge' ? ` / ${fmt(report.storage)}` : ''}</h4>${lines(report.breakdown[key])}
      <div class="line"><b>Net</b><b class="${report.net[key] >= 0 ? 'pos' : 'neg'}">${fmtRate(report.net[key])}</b></div>
      <p class="muted">${desc[key]}</p>`;
  }
}
