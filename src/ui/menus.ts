import { randomSeedString } from '../core/rng';
import { slotInfo, SLOTS, browserStore } from '../core/save';
import { WORLD_SIZES, type WorldSizeName } from '../core/world';
import { ERAS } from '../config/eras';
import type { GameController } from '../game/GameController';
import { formatTime, h } from './dom';
import { openModal, toast } from './widgets';

export interface MenuHooks {
  onSettingsChanged: () => void;
  onStartNew: () => void;
  onContinue: () => void;
  records: () => void;
}

const SLOT_LABEL: Record<string, string> = { auto: 'Autosave', slot1: 'Slot 1', slot2: 'Slot 2', slot3: 'Slot 3' };

function slotMeta(slot: string): string {
  const info = slotInfo(browserStore(), slot);
  if (!info) return 'Empty';
  return `${ERAS[info.era - 1]?.name ?? '?'} · pop ${info.population} · ${formatTime(info.tick)} · ${new Date(info.savedAt).toLocaleString()}`;
}

export class Menus {
  constructor(private ctrl: GameController, private hooks: MenuHooks) {}

  title(): void {
    const hasAuto = !!slotInfo(browserStore(), 'auto');
    openModal(
      (b, close) => {
        b.append(
          h('div', { class: 'title-screen' },
            h('div', { class: 'logo', text: 'TINY EMPIRES' }),
            h('p', { class: 'muted', text: 'Grow a tiny island settlement into a thriving civilization.' }),
            h('div', { class: 'btns' },
              hasAuto ? h('button', { class: 'btn primary', text: '▶ Continue', onclick: () => (close(), this.hooks.onContinue()) }) : null,
              h('button', { class: `btn${hasAuto ? '' : ' primary'}`, text: '🌱 New island', onclick: () => (close(), this.newWorld(true)) }),
              h('button', { class: 'btn', text: '📂 Load game', onclick: () => this.load() }),
              h('button', { class: 'btn', text: '❓ How to play', onclick: () => this.help() }),
              h('button', { class: 'btn', text: '⚙️ Settings', onclick: () => this.settings() }),
            ),
            h('p', { class: 'muted', html: 'Original pixel art & music generated in your browser. Works offline.' }),
          ),
        );
      },
      { narrow: true, dismissable: false, label: 'Title screen' },
    );
  }

  main(): void {
    openModal((b, close) => {
      b.append(
        h('h1', { text: 'Menu' }),
        h('div', { class: 'actions' },
          h('button', { class: 'btn primary', text: '▶ Resume', onclick: close }),
          h('button', { class: 'btn', text: '💾 Save game', onclick: () => this.save() }),
          h('button', { class: 'btn', text: '📂 Load game', onclick: () => this.load() }),
          h('button', { class: 'btn', text: '🌱 New island', onclick: () => this.newWorld(false) }),
          h('button', { class: 'btn', text: '🔄 Restart this island', onclick: () => this.restart(close) }),
          h('button', { class: 'btn', text: '🏆 Records & achievements', onclick: () => (close(), this.hooks.records()) }),
          h('button', { class: 'btn', text: '⚙️ Settings', onclick: () => this.settings() }),
          h('button', { class: 'btn', text: '❓ How to play', onclick: () => this.help() }),
        ),
      );
    }, { narrow: true, label: 'Menu' });
  }

  save(): void {
    openModal((b, close) => {
      b.append(h('h1', { text: '💾 Save game' }), h('p', { class: 'muted', text: 'Progress is also autosaved every 30 seconds.' }));
      for (const slot of SLOTS.filter((s) => s !== 'auto')) {
        b.append(
          h('div', { class: 'slot' },
            h('div', {}, h('b', { text: SLOT_LABEL[slot] }), h('div', { class: 'meta', text: slotMeta(slot) })),
            h('button', { class: 'btn small primary', text: 'Save here', onclick: () => {
              this.ctrl.saveSlot(slot);
              toast(`Saved to ${SLOT_LABEL[slot]}.`, 'good');
              close();
            } }),
          ),
        );
      }
      b.append(h('h3', { text: 'Export' }), h('p', { class: 'muted', text: 'Copy this text to back up your game or move it to another device.' }));
      const ta = h('textarea', { attrs: { readonly: 'true', 'aria-label': 'Exported save' } });
      ta.value = this.ctrl.exportSave();
      b.append(ta, h('button', { class: 'btn small', text: 'Copy to clipboard', onclick: () => {
        ta.select();
        navigator.clipboard?.writeText(ta.value).then(() => toast('Copied!', 'good'), () => toast('Select the text and copy it manually.', 'bad'));
      } }));
    }, { narrow: true, label: 'Save game' });
  }

  load(): void {
    openModal((b, close) => {
      b.append(h('h1', { text: '📂 Load game' }));
      for (const slot of SLOTS) {
        const info = slotInfo(browserStore(), slot);
        b.append(
          h('div', { class: 'slot' },
            h('div', {}, h('b', { text: SLOT_LABEL[slot] }), h('div', { class: 'meta', text: slotMeta(slot) })),
            h('button', { class: 'btn small primary', text: 'Load', disabled: !info, onclick: () => {
              const err = this.ctrl.loadSlot(slot);
              if (err) return toast(err, 'bad');
              toast('Game loaded.', 'good');
              close();
              this.hooks.onContinue();
            } }),
          ),
        );
      }
      b.append(h('h3', { text: 'Import' }));
      const ta = h('textarea', { attrs: { placeholder: 'Paste an exported save here', 'aria-label': 'Import save' } });
      b.append(ta, h('button', { class: 'btn small', text: 'Import', onclick: () => {
        const err = this.ctrl.importSave(ta.value.trim());
        if (err) return toast(err, 'bad');
        toast('Save imported.', 'good');
        close();
        this.hooks.onContinue();
      } }));
    }, { narrow: true, label: 'Load game' });
  }

  newWorld(fromTitle: boolean): void {
    let size: WorldSizeName = 'medium';
    openModal((b, close) => {
      const seed = h('input', { attrs: { type: 'text', value: randomSeedString(), 'aria-label': 'World seed', maxlength: '40' } });
      const sizes = h('div', { class: 'seg', attrs: { role: 'radiogroup', 'aria-label': 'Island size' } });
      // Build the buttons once and only toggle classes: replacing the clicked
      // button mid-click made the browser re-target the click to "Small".
      const sizeButtons = (Object.keys(WORLD_SIZES) as WorldSizeName[]).map((k) =>
        h('button', {
          text: `${k[0].toUpperCase()}${k.slice(1)}`,
          title: `${WORLD_SIZES[k]}×${WORLD_SIZES[k]} tiles`,
          attrs: { type: 'button', role: 'radio', 'data-size': k },
          onclick: () => {
            size = k;
            renderSizes();
          },
        }),
      );
      const renderSizes = (): void => {
        for (const b of sizeButtons) {
          const on = b.dataset.size === size;
          b.classList.toggle('on', on);
          b.setAttribute('aria-checked', String(on));
        }
      };
      sizes.append(...sizeButtons);
      renderSizes();
      b.append(
        h('h1', { text: '🌱 New island' }),
        h('p', { class: 'muted', text: 'Every seed creates a unique island. Share seeds with friends to play the same map.' }),
        // <div>, not <label>: a label forwards clicks on its contents to its first control.
        h('div', { class: 'field' }, h('span', { text: 'Seed' }), h('span', { class: 'row' }, seed, h('button', { class: 'btn small', text: '🎲', title: 'Random seed', attrs: { type: 'button' }, onclick: () => (seed.value = randomSeedString()) }))),
        h('div', { class: 'field' }, h('span', { text: 'Island size' }), sizes),
        h('div', { class: 'actions' },
          h('button', { class: 'btn primary', text: 'Found settlement', onclick: () => {
            this.ctrl.newGame(seed.value.trim() || randomSeedString(), WORLD_SIZES[size]);
            close();
            this.hooks.onStartNew();
          } }),
        ),
      );
    }, { narrow: true, label: 'New island', onClose: () => fromTitle && !this.ctrl.state && this.title() });
  }

  private restart(closeMenu: () => void): void {
    openModal((b, close) => {
      b.append(
        h('h1', { text: 'Restart island?' }),
        h('p', { text: `Start over on the same island (${this.ctrl.state.seed}). Current progress on this island will be lost unless saved.` }),
        h('div', { class: 'row' },
          h('button', { class: 'btn danger', text: 'Restart', onclick: () => {
            this.ctrl.newGame(this.ctrl.state.seed, this.ctrl.state.size);
            close();
            closeMenu();
            this.hooks.onStartNew();
          } }),
          h('button', { class: 'btn', text: 'Cancel', onclick: close }),
        ),
      );
    }, { narrow: true, label: 'Restart' });
  }

  settings(): void {
    const st = this.ctrl.meta.settings;
    openModal((b) => {
      const slider = (label: string, get: () => number, set: (v: number) => void): HTMLElement => {
        const input = h('input', { attrs: { type: 'range', min: '0', max: '1', step: '0.05', 'aria-label': label } });
        input.value = String(get());
        input.addEventListener('input', () => {
          set(Number(input.value));
          this.persist();
        });
        return h('label', { class: 'field' }, h('span', { text: label }), input);
      };
      const toggle = (label: string, get: () => boolean, set: (v: boolean) => void): HTMLElement => {
        const input = h('input', { attrs: { type: 'checkbox', 'aria-label': label } });
        input.checked = get();
        input.addEventListener('change', () => {
          set(input.checked);
          this.persist();
        });
        return h('label', { class: 'field' }, h('span', { text: label }), input);
      };
      const scale = h('select', { attrs: { 'aria-label': 'Interface size' } });
      for (const [v, l] of [[0.9, 'Small'], [1, 'Normal'], [1.15, 'Large'], [1.3, 'Extra large']] as const) {
        const o = h('option', { text: l, attrs: { value: String(v) } });
        if (st.uiScale === v) o.selected = true;
        scale.append(o);
      }
      scale.addEventListener('change', () => {
        st.uiScale = Number(scale.value);
        this.persist();
      });
      b.append(
        h('h1', { text: '⚙️ Settings' }),
        slider('🎵 Music volume', () => st.music, (v) => (st.music = v)),
        slider('🔊 Sound effects', () => st.sfx, (v) => (st.sfx = v)),
        toggle('Autosave every 30s', () => st.autosave, (v) => (st.autosave = v)),
        toggle('Reduce motion & effects', () => st.reducedMotion, (v) => (st.reducedMotion = v)),
        h('label', { class: 'field' }, h('span', { text: 'Interface size' }), scale),
        h('div', { class: 'row', style: 'margin-top:10px' },
          h('button', { class: 'btn small', text: 'Replay tutorial', onclick: () => {
            st.tutorialDone = false;
            st.tutorialStep = 0;
            this.persist();
            toast('The tutorial will restart.', 'info');
          } }),
        ),
      );
    }, { narrow: true, label: 'Settings' });
  }

  private persist(): void {
    this.ctrl.meta.save();
    this.hooks.onSettingsChanged();
  }

  help(): void {
    openModal((b) => {
      b.append(
        h('h1', { text: '❓ How to play' }),
        h('p', { text: 'Your people have landed on an uncharted island. Grow from a hamlet into an empire by managing resources, people and research — then build the Grand Lighthouse.' }),
        h('h3', { text: 'The loop' }),
        h('ul', { html: '<li><b>Build</b> farms, lumber mills and quarries to produce food, wood and stone.</li><li><b>House</b> your people — population only grows with free housing, stored food and happiness ≥ 35.</li><li><b>Employ</b> them — production buildings need workers. Too few people slows everything; too many leaves people unemployed and unhappy.</li><li><b>Research</b> with knowledge from schools to unlock buildings and upgrades.</li><li><b>Advance eras</b> by meeting the goals shown in the top-left.</li><li><b>Decide</b> how to handle events — each choice has trade-offs.</li>' }),
        h('h3', { text: 'Controls' }),
        h('ul', { html: '<li>Drag / <span class="kbd">WASD</span> / arrow keys — move the camera</li><li>Mouse wheel / pinch / <span class="kbd">Q</span> <span class="kbd">E</span> — zoom</li><li>Click a building card, then click the map to build. Right-click or <span class="kbd">Esc</span> to stop.</li><li>Click any tile or building for details, upgrades and demolition.</li><li><span class="kbd">Space</span> pause · <span class="kbd">1</span> <span class="kbd">2</span> <span class="kbd">3</span> speed · <span class="kbd">R</span> research · <span class="kbd">T</span> economy · <span class="kbd">G</span> goals · <span class="kbd">U</span> upgrade selected · <span class="kbd">Del</span> demolish selected</li><li>Hover (or tap) any resource in the top bar for a detailed breakdown.</li>' }),
        h('h3', { text: 'Tips' }),
        h('ul', { html: '<li>Storage limits cap food, wood, stone and gold — build warehouses before saving up for big projects.</li><li>Gold pays upkeep for schools and temples; if you run out, they stop working.</li><li>Taxes trade gold for happiness. Lower them when people grow restless.</li><li>Your territory grows as you build. Expand toward forests, mountains, gold veins and the coast.</li>' }),
      );
    }, { label: 'How to play' });
  }
}
