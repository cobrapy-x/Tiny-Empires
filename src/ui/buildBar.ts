import { BUILD_ORDER, BUILDINGS } from '../config/buildings';
import { canAfford, isUnlocked, levelDef } from '../core/buildingSystem';
import type { BuildingType } from '../core/types';
import type { GameController } from '../game/GameController';
import { buildingIconUrl } from '../render/sprites';
import { $, clear, costHtml, h } from './dom';
import { tip } from './widgets';

export interface ToolHandlers {
  research: () => void;
  economy: () => void;
  goals: () => void;
  achievements: () => void;
}

export class BuildBar {
  private cards = new Map<BuildingType, HTMLButtonElement>();
  private researchBadge!: HTMLElement;
  readonly toolButtons: Record<keyof ToolHandlers, HTMLButtonElement>;

  constructor(private ctrl: GameController, tools: ToolHandlers) {
    const toolsEl = $('#tools');
    toolsEl.classList.add('panel');
    const mk = (id: keyof ToolHandlers, label: string, key: string): HTMLButtonElement => {
      const b = h('button', { class: 'tool-btn', html: label, title: `${label.replace(/<[^>]+>/g, '')} (${key})`, onclick: tools[id] });
      toolsEl.append(b);
      return b;
    };
    this.toolButtons = {
      research: mk('research', '🔬 Research', 'R'),
      economy: mk('economy', '⚖️ Economy', 'T'),
      goals: mk('goals', '🎯 Goals', 'G'),
      achievements: mk('achievements', '🏆 Records', 'A'),
    };
    this.researchBadge = h('span', { class: 'badge', text: '!' });
    this.researchBadge.hidden = true;
    this.toolButtons.research.append(this.researchBadge);

    const list = $('#build-list');
    list.classList.add('panel');
    for (const type of BUILD_ORDER) {
      const def = BUILDINGS[type];
      const card = h(
        'button',
        {
          class: 'bcard',
          attrs: { 'aria-label': `Build ${def.name}`, 'data-type': type },
          onclick: () => {
            if (!isUnlocked(ctrl.state, type).ok) {
              ctrl.bus.emit('toast', { text: isUnlocked(ctrl.state, type).reason ?? 'Locked', kind: 'bad' });
              ctrl.bus.emit('action', { kind: 'error' });
              return;
            }
            ctrl.setBuildMode(ctrl.buildMode === type ? null : type);
            ctrl.bus.emit('action', { kind: 'click' });
          },
        },
        h('img', { class: 'px', attrs: { src: buildingIconUrl(type), alt: '' } }),
        h('span', { class: 'name', text: def.name }),
        h('span', { class: 'cost' }),
      );
      tip(card, () => this.cardTip(type));
      this.cards.set(type, card);
      list.append(card);
    }
    // Horizontal wheel scrolling for the build list.
    list.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        list.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }, { passive: false });

    ctrl.bus.on('buildMode', () => {
      this.update();
      this.renderBanner();
    });
  }

  private cardTip(type: BuildingType): string {
    const def = BUILDINGS[type];
    const l1 = levelDef(type, 1);
    const unlocked = isUnlocked(this.ctrl.state, type);
    const stats: string[] = [];
    if (l1.housing) stats.push(`Housing +${l1.housing}`);
    if (l1.workers) stats.push(`Workers ${l1.workers}`);
    if (l1.produces) stats.push(`Produces ${Object.entries(l1.produces).map(([k, v]) => `${v}/s ${k}`).join(', ')}`);
    if (l1.upkeep) stats.push(`Upkeep ${Object.entries(l1.upkeep).map(([k, v]) => `${v}/s ${k}`).join(', ')}`);
    if (l1.storage) stats.push(`Storage +${l1.storage}`);
    if (l1.happiness) stats.push(`Happiness +${l1.happiness}`);
    return `<h4>${def.name}</h4><div>${def.description}</div>
      <div class="muted" style="margin-top:4px">${stats.join(' · ')}</div>
      <div style="margin-top:4px">Cost: ${costHtml(l1.cost, this.ctrl.state.resources)} · ${l1.time}s to build</div>
      <div class="muted">${def.placementHint}${def.levels.length > 1 ? ` · Upgradable to Lv${def.levels.length}` : ''}</div>
      ${unlocked.ok ? '' : `<div class="neg" style="margin-top:4px">🔒 ${unlocked.reason}</div>`}`;
  }

  update(): void {
    const s = this.ctrl.state;
    for (const [type, card] of this.cards) {
      const unlocked = isUnlocked(s, type).ok;
      const cost = levelDef(type, 1).cost;
      card.classList.toggle('locked', !unlocked);
      card.classList.toggle('poor', unlocked && !canAfford(s, cost));
      card.classList.toggle('selected', this.ctrl.buildMode === type);
      const costEl = card.querySelector('.cost') as HTMLElement;
      const html = costHtml(cost, s.resources);
      if (costEl.innerHTML !== html) costEl.innerHTML = html;
      // Hide wonders until they are relevant.
      card.hidden = type === 'lighthouse' && s.era < 3;
    }
    const canStart = !s.research && s.researched.length < 15;
    this.researchBadge.hidden = !canStart || s.resources.knowledge < 25;
  }

  private renderBanner(): void {
    const banner = $('#build-banner');
    const type = this.ctrl.buildMode;
    banner.classList.add('panel');
    if (!type) {
      banner.hidden = true;
      return;
    }
    clear(banner);
    banner.append(
      h('span', { html: `Placing <b>${BUILDINGS[type].name}</b> — ${BUILDINGS[type].placementHint}` }),
      h('button', { class: 'btn small', text: 'Done', onclick: () => this.ctrl.setBuildMode(null) }),
    );
    banner.hidden = false;
  }

  highlight(target: string | null): void {
    document.querySelectorAll('.highlight').forEach((e) => e.classList.remove('highlight'));
    if (!target) return;
    const el = target.startsWith('tool:')
      ? this.toolButtons[target.slice(5) as keyof ToolHandlers]
      : this.cards.get(target as BuildingType);
    el?.classList.add('highlight');
    if (el && !target.startsWith('tool:')) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
