import { ACHIEVEMENTS } from '../config/achievements';
import { TAX_LEVELS } from '../config/balance';
import { ERAS } from '../config/eras';
import { EVENT_BY_ID } from '../config/events';
import { TECHS, TECH_BY_ID } from '../config/techs';
import { choiceAvailable } from '../core/events';
import { requirementProgress } from '../core/progression';
import { canResearch, techStatus } from '../core/research';
import { buyPrice, canTrade, sellPrice, TRADABLES } from '../core/trade';
import type { GameController } from '../game/GameController';
import { costHtml, fmt, fmtRate, formatTime, h, icon } from './dom';
import { openModal, rebuild, type ModalHandle } from './widgets';

const TIER_NAMES = ['', 'Hamlet', 'Village', 'Town', 'City'];

/** Panels that live-update while open. */
export class Panels {
  private live: { handle: ModalHandle; build: (b: HTMLElement, c: () => void) => void; sig: () => string; last: string } | null = null;
  private eventHandle: ModalHandle | null = null;
  private eventSig = '';

  constructor(private ctrl: GameController) {}

  /** Called on state changes: refresh whichever panel is open. */
  refresh(): void {
    if (this.live && this.live.handle.el.isConnected) {
      // Only rebuild when something visible changed, so clicks are never swallowed.
      const sig = this.live.sig();
      if (sig !== this.live.last) {
        this.live.last = sig;
        rebuild(this.live.handle, this.live.build);
      }
    } else this.live = null;
    this.syncEvent();
  }

  private openLive(build: (b: HTMLElement, c: () => void) => void, label: string, sig: () => string): void {
    this.live = null;
    const handle = openModal(build, { label, onClose: () => (this.live = null) });
    this.live = { handle, build, sig, last: sig() };
  }

  private baseSig(): string {
    const s = this.ctrl.state;
    return [s.era, s.researched.length, s.research?.id, s.buildings.length, s.taxRate, s.stats.trades].join('|');
  }

  // ---- Research ----
  research(): void {
    this.openLive((b) => {
      const s = this.ctrl.state;
      b.append(h('h1', { text: '🔬 Research' }));
      b.append(h('p', { class: 'muted', html: `Knowledge: <b>${fmt(s.resources.knowledge)}</b> (${fmtRate(this.ctrl.report.net.knowledge)}). Pick a technology to study — it costs knowledge up front and takes time. New tiers unlock with each era.` }));
      if (s.research) {
        const t = TECH_BY_ID[s.research.id];
        const p = 1 - s.research.remaining / s.research.total;
        b.append(h('div', { html: `Researching <b>${t.name}</b> — ${s.research.remaining}s left` }), h('div', { class: 'progress' }, h('i', { style: `width:${Math.round(p * 100)}%` })));
      }
      const tree = h('div', { class: 'tech-tree' });
      for (let tier = 1; tier <= 4; tier++) {
        const col = h('div', { class: 'tech-col' }, h('h4', { text: `Tier ${tier} · ${TIER_NAMES[tier]}` }));
        for (const t of TECHS.filter((x) => x.tier === tier)) {
          const st = techStatus(s, t);
          const check = canResearch(s, t.id);
          const missing = t.requires.filter((r) => !s.researched.includes(r)).map((r) => TECH_BY_ID[r].name);
          const btn = h(
            'button',
            {
              class: `tech ${st}`,
              disabled: st !== 'available' || !check.ok,
              title: check.reason ?? `Research ${t.name}`,
              onclick: () => this.ctrl.research(t.id),
            },
            h('div', { class: 't-name' }, h('span', { text: `${st === 'done' ? '✓ ' : ''}${t.name}` }), h('span', { class: 'muted', html: st === 'done' ? '' : `${t.cost} 📜` })),
            h('div', { class: 't-desc', text: t.description }),
            st === 'locked' && tier > s.era ? h('div', { class: 't-req', text: `Reach the ${TIER_NAMES[tier]} era` }) : null,
            st === 'locked' && missing.length ? h('div', { class: 't-req', text: `Needs ${missing.join(' & ')}` }) : null,
            st === 'available' && !check.ok ? h('div', { class: 't-req', text: check.reason ?? '' }) : null,
            st === 'active' ? h('div', { class: 't-req', text: 'In progress…' }) : null,
          );
          col.append(btn);
        }
        tree.append(col);
      }
      b.append(tree);
    }, 'Research', () => {
      const s = this.ctrl.state;
      return `${this.baseSig()}|${Math.floor((s.research?.remaining ?? 0) / 3)}|${TECHS.map((t) => canResearch(s, t.id).ok).join('')}|${Math.floor(s.resources.knowledge / 5)}`;
    });
  }

  // ---- Economy: taxes + trade ----
  economy(): void {
    this.openLive((b) => {
      const s = this.ctrl.state;
      b.append(h('h1', { text: '⚖️ Economy' }));
      b.append(h('h3', { text: 'Tax rate' }));
      const seg = h('div', { class: 'seg', attrs: { role: 'radiogroup', 'aria-label': 'Tax rate' } });
      TAX_LEVELS.forEach((t, i) =>
        seg.append(h('button', { class: s.taxRate === i ? 'on' : '', text: t.label, attrs: { role: 'radio', 'aria-checked': String(s.taxRate === i) }, onclick: () => this.ctrl.setTax(i as 0 | 1 | 2) })),
      );
      const tax = TAX_LEVELS[s.taxRate];
      b.append(seg, h('p', { class: 'muted', text: `${tax.label} taxes: ${tax.goldPerPop} gold per person per second, ${tax.happiness >= 0 ? '+' : ''}${tax.happiness} happiness.` }));

      b.append(h('h3', { text: 'Market trading' }));
      const hasMarket = s.buildings.some((x) => x.type === 'market' && (x.construction === 0 || x.upgradeTo > 0));
      if (!hasMarket) {
        b.append(h('p', { class: 'muted', text: s.researched.includes('bartering') ? 'Build a Market to trade goods for gold.' : 'Research Bartering and build a Market to trade goods for gold.' }));
      } else {
        b.append(h('p', { class: 'muted', text: 'Trade in lots of 10. More markets, Currency and Navigation improve prices.' }));
        for (const r of TRADABLES) {
          const sell = canTrade(s, this.ctrl.world, r, 'sell');
          const buy = canTrade(s, this.ctrl.world, r, 'buy');
          b.append(
            h('div', { class: 'trade-row' },
              h('span', {}, icon(r, 16), h('b', { text: r[0].toUpperCase() + r.slice(1) })),
              h('span', { class: 'muted stock', text: `${fmt(s.resources[r])} in store` }),
              h('button', { class: 'btn small', disabled: !sell.ok, title: sell.reason ?? '', html: `Sell 10 → +${sellPrice(s, r)} gold`, onclick: () => this.ctrl.trade(r, 'sell') }),
              h('button', { class: 'btn small', disabled: !buy.ok, title: buy.reason ?? '', html: `Buy 10 ← ${buyPrice(s, r)} gold`, onclick: () => this.ctrl.trade(r, 'buy') }),
            ),
          );
        }
      }
      const r = this.ctrl.report;
      b.append(h('h3', { text: 'Overview' }));
      const grid = h('div', { class: 'grid2' });
      for (const k of ['food', 'wood', 'stone', 'gold', 'knowledge'] as const) {
        grid.append(h('div', { class: 'stat-row' }, h('span', {}, icon(k, 14), ` ${k}`), h('span', { text: `${fmtRate(r.net[k])}` })));
      }
      grid.append(h('div', { class: 'stat-row' }, h('span', { text: 'Workforce' }), h('span', { text: `${r.employed}/${r.jobs} jobs` })));
      b.append(grid);
    }, 'Economy', () => {
      const s = this.ctrl.state;
      return `${this.baseSig()}|${TRADABLES.map((r) => `${canTrade(s, this.ctrl.world, r, 'sell').ok}${canTrade(s, this.ctrl.world, r, 'buy').ok}${Math.floor(s.resources[r])}`).join(',')}|${Math.floor(s.resources.gold)}`;
    });
  }

  // ---- Goals ----
  goals(): void {
    this.openLive((b) => {
      const s = this.ctrl.state;
      b.append(h('h1', { text: '🎯 Goals' }), h('p', { class: 'muted', text: 'Grow from a humble hamlet into an island empire. Each era unlocks new research and upgrades.' }));
      for (const era of ERAS) {
        const reached = s.era >= era.id;
        const current = s.era + 1 === era.id;
        const box = h('div', { class: 'slot', style: current ? 'border:1px solid var(--accent)' : '' });
        const left = h('div', {}, h('b', { text: `${reached ? '✓ ' : current ? '➜ ' : ''}${era.id}. ${era.name}` }), h('div', { class: 'meta', text: era.reward || 'Your story begins.' }));
        if (current) {
          for (const r of requirementProgress(s, era.requires)) {
            left.append(h('div', { class: `req${r.met ? ' met' : ''}` }, h('span', { text: r.label }), h('span', { text: `${r.current}/${r.target}` })), h('div', { class: 'bar' }, h('i', { style: `width:${Math.round((r.current / r.target) * 100)}%` })));
          }
        }
        box.append(left);
        b.append(box);
      }
      b.append(h('h3', { text: 'Tips' }), h('ul', { class: 'muted', html: '<li>Build farms next to rivers for +40% food.</li><li>Lumber mills and quarries produce more with more forest / mountain tiles around them.</li><li>Every building with workers needs people — balance houses and jobs.</li><li>Warehouses raise storage limits; big projects need big storage.</li><li>Markets and temples keep a growing population happy.</li>' }));
    }, 'Goals', () => `${this.baseSig()}|${this.ctrl.state.population}|${this.ctrl.state.buildings.filter((x) => x.construction === 0).length}`);
  }

  // ---- Achievements & stats ----
  achievements(): void {
    this.openLive((b) => {
      const s = this.ctrl.state;
      const meta = this.ctrl.meta.data;
      b.append(h('h1', { text: '🏆 Records' }));
      b.append(h('h3', { text: `Achievements (${meta.achievements.length}/${ACHIEVEMENTS.length})` }));
      const grid = h('div', { class: 'grid2' });
      for (const a of ACHIEVEMENTS) {
        const got = meta.achievements.includes(a.id);
        grid.append(h('div', { class: `ach${got ? ' unlocked' : ''}` }, h('span', { class: 'medal', text: '🏅' }), h('div', {}, h('b', { text: a.name }), h('span', { class: 'muted', text: a.description }))));
      }
      b.append(grid);
      b.append(h('h3', { text: 'This island' }));
      const st = s.stats;
      const rows: [string, string][] = [
        ['Time played', formatTime(s.tick)],
        ['Era', ERAS[s.era - 1].name],
        ['Peak population', `${st.peakPopulation}`],
        ['Buildings completed', `${st.buildingsBuilt}`],
        ['Upgrades completed', `${st.upgradesDone}`],
        ['Technologies', `${s.researched.length}/${TECHS.length}`],
        ['Events handled', `${st.eventsResolved}`],
        ['Trades', `${st.trades}`],
        ['Food produced', fmt(st.produced.food)],
        ['Wood produced', fmt(st.produced.wood)],
        ['Stone produced', fmt(st.produced.stone)],
        ['Gold earned', fmt(st.produced.gold)],
        ['Knowledge gained', fmt(st.produced.knowledge)],
        ['World seed', s.seed],
      ];
      const g2 = h('div', { class: 'grid2' });
      for (const [l, v] of rows) g2.append(h('div', { class: 'stat-row' }, h('span', { text: l }), h('b', { text: v })));
      b.append(g2);
      b.append(h('h3', { text: 'Lifetime' }));
      const g3 = h('div', { class: 'grid2' });
      for (const [l, v] of [
        ['Islands founded', `${meta.gamesStarted}`],
        ['Empires completed', `${meta.victories}`],
        ['Best population', `${Math.max(meta.bestPopulation, st.peakPopulation)}`],
      ]) g3.append(h('div', { class: 'stat-row' }, h('span', { text: l }), h('b', { text: v })));
      b.append(g3);
    }, 'Records', () => `${this.baseSig()}|${this.ctrl.meta.data.achievements.length}|${Math.floor(this.ctrl.state.tick / 5)}`);
  }

  // ---- Events (blocking) ----
  syncEvent(): void {
    const pe = this.ctrl.state.pendingEvent;
    if (!pe) {
      if (this.eventHandle) {
        this.eventHandle.close();
        this.eventHandle = null;
      }
      return;
    }
    const build = (b: HTMLElement): void => {
      const def = EVENT_BY_ID[pe.id];
      const s = this.ctrl.state;
      b.append(h('div', { class: 'row' }, h('span', { class: 'event-icon', text: def.icon }), h('h1', { text: def.title })));
      b.append(h('p', { text: def.text(s, pe.data) }));
      def.choices.forEach((c, i) => {
        const avail = choiceAvailable(s, this.ctrl.world, c);
        const cost = c.cost?.(s, pe.data);
        b.append(
          h('button', {
            class: `btn choice${i === 0 ? ' primary' : ''}`,
            disabled: !avail.ok,
            html: `${i + 1}. ${c.label}${cost ? ` <span style="float:right">${costHtml(cost, s.resources)}</span>` : ''}<span class="detail">${avail.ok ? c.detail(s, pe.data) : `${c.detail(s, pe.data)} — ${avail.reason}`}</span>`,
            onclick: () => this.ctrl.chooseEvent(i),
          }),
        );
      });
      b.append(h('p', { class: 'muted', text: 'Time is paused until you decide. (Keys 1–3 pick a choice)' }));
    };
    const sig = `${pe.id}|${JSON.stringify(pe.data)}|${JSON.stringify(this.ctrl.state.resources)}`;
    if (this.eventHandle && this.eventHandle.el.isConnected) {
      if (sig !== this.eventSig) rebuild(this.eventHandle, build);
      this.eventSig = sig;
      return;
    }
    this.eventSig = sig;
    this.eventHandle = openModal(build, { narrow: true, dismissable: false, label: 'Event' });
    this.ctrl.bus.emit('action', { kind: 'click' });
  }

  get eventOpen(): boolean {
    return !!this.eventHandle;
  }

  victory(onNew: () => void): void {
    const s = this.ctrl.state;
    openModal((b, close) => {
      b.append(
        h('div', { class: 'title-screen' },
          h('div', { class: 'logo', text: 'EMPIRE!' }),
          h('p', { html: `The Grand Lighthouse shines over <b>${s.seed}</b>. Ships from distant lands now sail to your island.<br>You built an empire of <b>${s.population}</b> people in <b>${formatTime(s.tick)}</b> of game time.` }),
          h('div', { class: 'btns' },
            h('button', { class: 'btn primary', text: 'Keep playing', onclick: close }),
            h('button', { class: 'btn', text: 'New island', onclick: () => (close(), onNew()) }),
            h('button', { class: 'btn', text: 'View records', onclick: () => (close(), this.achievements()) }),
          ),
        ),
      );
    }, { narrow: true, label: 'Victory' });
  }

  /** Small text helper for costs used by tutorial etc. */
  static costText = costHtml;
}
