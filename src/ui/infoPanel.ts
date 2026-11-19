import { BUILD_ORDER, BUILDINGS } from '../config/buildings';
import {
  buildingAt,
  canPlace,
  canUpgrade,
  demolishRefund,
  levelDef,
  previewSite,
  siteMultiplier,
  terrainAllows,
} from '../core/buildingSystem';
import { Terrain, type Building } from '../core/types';
import { countNeighbours, terrainAt } from '../core/world';
import type { GameController } from '../game/GameController';
import { buildingIconUrl } from '../render/sprites';
import { $, clear, costHtml, h, iconHtml } from './dom';

const TERRAIN_NAMES: Record<Terrain, string> = {
  [Terrain.Deep]: 'Deep sea',
  [Terrain.Shallow]: 'Shallow water',
  [Terrain.Beach]: 'Beach',
  [Terrain.Grass]: 'Grassland',
  [Terrain.Forest]: 'Forest',
  [Terrain.Mountain]: 'Mountain',
  [Terrain.Desert]: 'Desert',
  [Terrain.River]: 'River',
};

export class InfoPanel {
  private el = $('#info-panel');
  private confirmDemolish = false;
  private lastKey = '';

  constructor(private ctrl: GameController) {
    this.el.classList.add('panel');
    ctrl.bus.on('select', () => {
      this.confirmDemolish = false;
      this.lastKey = '';
      this.update();
    });
  }

  update(): void {
    const sel = this.ctrl.selection;
    if (!sel) {
      this.el.hidden = true;
      return;
    }
    const b = buildingAt(this.ctrl.state, sel.x, sel.y);
    // Avoid rebuilding DOM every tick when nothing relevant changed (keeps buttons clickable).
    const s = this.ctrl.state;
    const key = JSON.stringify([sel, b, this.confirmDemolish, Math.floor(s.resources.wood), Math.floor(s.resources.stone), Math.floor(s.resources.gold), s.researched.length, s.era, Math.round(this.ctrl.report.workforce * 100)]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    clear(this.el);
    this.el.hidden = false;
    this.el.append(h('button', { class: 'icon-btn close', text: '✕', attrs: { 'aria-label': 'Close' }, onclick: () => this.ctrl.select(null) }));
    if (b) this.renderBuilding(b);
    else this.renderTile(sel.x, sel.y);
  }

  private renderTile(x: number, y: number): void {
    const { world, state } = this.ctrl;
    const t = terrainAt(world, x, y);
    const notes: string[] = [];
    if (world.goldOre[y * world.size + x]) notes.push('✨ Gold vein — build a Gold Mine here.');
    if (t === Terrain.Forest) notes.push('Lumber Mills next to forests produce wood.');
    if (t === Terrain.Mountain) notes.push('Quarries next to mountains produce stone.');
    if ((t === Terrain.Grass || t === Terrain.Desert) && countNeighbours(world, x, y, (n) => n === Terrain.River) > 0) notes.push('🌊 River bank: farms here get +40% food.');
    if (t === Terrain.Desert) notes.push('Farms yield half here until Irrigation.');
    if (t === Terrain.Deep || t === Terrain.Shallow || t === Terrain.River) notes.push('Water cannot be built on.');
    this.el.append(h('h2', { text: TERRAIN_NAMES[t] }), h('div', { class: 'muted', text: `Tile ${x}, ${y}` }));
    for (const n of notes) this.el.append(h('p', { class: 'muted', text: n }));
    // Quick build options valid on this tile.
    const options = BUILD_ORDER.filter((type) => terrainAllows(world, type, x, y).ok);
    if (options.length) {
      const grid = h('div', { class: 'quick-build' });
      for (const type of options) {
        const check = canPlace(state, world, type, x, y);
        const site = previewSite(state, world, type, x, y);
        const btn = h(
          'button',
          {
            class: 'btn small',
            disabled: !check.ok,
            title: check.ok ? `Build ${BUILDINGS[type].name}${site !== 1 ? ` (yield ×${site.toFixed(2)})` : ''}` : check.reason,
            onclick: () => this.ctrl.place(type, x, y),
          },
          h('img', { class: 'px', attrs: { src: buildingIconUrl(type), alt: '' } }),
          h('span', { text: BUILDINGS[type].name }),
          site !== 1 && check.ok ? h('span', { class: 'muted', text: `×${site.toFixed(2)}` }) : null,
        );
        grid.append(btn);
      }
      this.el.append(h('div', { class: 'muted', text: 'Build here:' }), grid);
    }
  }

  private renderBuilding(b: Building): void {
    const { state, world, report } = this.ctrl;
    const def = BUILDINGS[b.type];
    const lv = levelDef(b.type, b.level);
    this.el.append(
      h('h2', {}, h('img', { class: 'px', attrs: { src: buildingIconUrl(b.type, b.level), alt: '' } }), h('span', { text: def.name })),
      h('div', { class: 'muted', text: `Level ${b.level} of ${def.levels.length}` }),
    );
    if (b.construction > 0) {
      const p = 1 - b.construction / Math.max(1, b.constructionTotal);
      this.el.append(
        h('div', { text: b.upgradeTo ? `Upgrading to level ${b.upgradeTo}… (${b.construction}s)` : `Under construction… (${b.construction}s)` }),
        h('div', { class: 'progress' }, h('i', { style: `width:${Math.round(p * 100)}%` })),
      );
    }
    this.el.append(h('p', { class: 'muted', text: def.description }));
    const rows: [string, string][] = [];
    const site = siteMultiplier(state, world, b);
    const eff = (lv.workers ? report.workforce : 1) * site * report.productionMultiplier;
    if (lv.housing) rows.push([`${iconHtml('housing')}Housing`, `${lv.housing}`]);
    if (lv.workers) rows.push([`${iconHtml('workers')}Workers`, `${lv.workers} (${Math.round(report.workforce * 100)}% staffed)`]);
    for (const [k, v] of Object.entries(lv.produces ?? {})) rows.push([`${iconHtml(k as 'food')}${k}`, `~${(v * eff).toFixed(2)}/s`]);
    for (const [k, v] of Object.entries(lv.upkeep ?? {})) rows.push([`${iconHtml(k as 'gold')}Upkeep`, `−${v}/s ${k}`]);
    if (lv.storage) rows.push([`${iconHtml('storage')}Storage`, `+${lv.storage}`]);
    if (lv.happiness) rows.push([`${iconHtml('happiness')}Happiness`, `+${lv.happiness}`]);
    if (site !== 1) rows.push(['Site bonus', `×${site.toFixed(2)}`]);
    for (const [l, v] of rows) this.el.append(h('div', { class: 'stat-row' }, h('span', { html: l }), h('span', { text: v })));

    const actions = h('div', { class: 'actions' });
    if (b.level < def.levels.length) {
      const up = canUpgrade(state, b);
      const next = def.levels[b.level];
      const gains: string[] = [];
      if (next.housing) gains.push(`housing ${next.housing}`);
      for (const [k, v] of Object.entries(next.produces ?? {})) gains.push(`${v}/s ${k}`);
      if (next.storage) gains.push(`storage +${next.storage}`);
      if (next.happiness) gains.push(`happiness +${next.happiness}`);
      if (next.workers) gains.push(`${next.workers} workers`);
      actions.append(
        h('button', {
          class: 'btn primary',
          disabled: !up.ok,
          title: up.reason ?? 'Upgrade (U)',
          html: `⬆ Upgrade to level ${b.level + 1}<span class="cost">${costHtml(next.cost, state.resources)} · ${next.time}s</span><span class="cost">${gains.join(', ')}</span>${up.ok ? '' : `<span class="cost">🔒 ${up.reason}</span>`}`,
          onclick: () => this.ctrl.upgradeAt(b.x, b.y),
        }),
      );
    }
    const canDemolish = b.type !== 'townhall' && !(b.type === 'lighthouse' && b.construction === 0);
    if (canDemolish) {
      const refund = demolishRefund(b);
      actions.append(
        h('button', {
          class: 'btn danger',
          html: this.confirmDemolish ? `Really demolish? Refund ${costHtml(refund)}` : `🗑 Demolish<span class="cost">Refund 50%: ${costHtml(refund)}</span>`,
          onclick: () => {
            if (!this.confirmDemolish) {
              this.confirmDemolish = true;
              this.lastKey = '';
              this.update();
              return;
            }
            this.ctrl.demolishAt(b.x, b.y);
            this.ctrl.select(null);
          },
        }),
      );
    }
    this.el.append(actions);
  }
}
