import type { AudioEngine } from '../audio/AudioEngine';
import { BUILDINGS } from '../config/buildings';
import { buildingAt, canPlace, previewSite } from '../core/buildingSystem';
import type { GameController } from '../game/GameController';
import type { HoverInfo, WorldScene } from '../render/WorldScene';
import { BuildBar } from './buildBar';
import { Hud } from './hud';
import { InfoPanel } from './infoPanel';
import { Menus } from './menus';
import { Panels } from './panels';
import { Tutorial } from './tutorial';
import { closeAllModals, closeTopModal, hideTip, modalOpen, showTip, toast } from './widgets';

/** Wires the HTML interface to the controller, renderer and audio. */
export class UI {
  readonly hud: Hud;
  readonly bar: BuildBar;
  readonly info: InfoPanel;
  readonly panels: Panels;
  readonly menus: Menus;
  readonly tutorial: Tutorial;
  private dirty = true;
  private started = false;

  constructor(private ctrl: GameController, private scene: WorldScene, private audio: AudioEngine) {
    this.panels = new Panels(ctrl);
    this.hud = new Hud(ctrl, () => this.panels.goals());
    this.bar = new BuildBar(ctrl, {
      research: () => this.panels.research(),
      economy: () => this.panels.economy(),
      goals: () => this.panels.goals(),
      achievements: () => this.panels.achievements(),
    });
    this.info = new InfoPanel(ctrl);
    this.tutorial = new Tutorial(ctrl, (t) => this.bar.highlight(t));
    this.menus = new Menus(ctrl, {
      onSettingsChanged: () => this.applySettings(),
      onStartNew: () => this.startPlaying(true),
      onContinue: () => this.startPlaying(false),
      records: () => this.panels.achievements(),
    });
    document.getElementById('btn-menu')!.addEventListener('click', () => this.menus.main());

    const bus = ctrl.bus;
    bus.on('changed', () => (this.dirty = true));
    bus.on('select', () => (this.dirty = true));
    bus.on('buildMode', () => hideTip());
    bus.on('toast', (t) => toast(t.text, t.kind));
    bus.on('action', (a) => {
      const map: Record<string, Parameters<AudioEngine['play']>[0]> = { place: 'place', upgrade: 'upgrade', demolish: 'demolish', error: 'error', click: 'click', coin: 'coin', research: 'research' };
      audio.play(map[a.kind]);
    });
    bus.on('tick', (msgs) => {
      for (const m of msgs) {
        if (m.kind === 'built') audio.play('built');
        if (m.kind === 'upgraded') audio.play('upgrade');
        if (m.kind === 'era') audio.play('era');
        if (m.kind === 'achievement') audio.play('achievement');
        if (m.kind === 'event') audio.play('event');
        if (m.kind === 'victory') window.setTimeout(() => this.panels.victory(() => this.menus.newWorld(false)), 800);
      }
    });
    bus.on('world', () => {
      closeAllModals();
      this.dirty = true;
    });

    scene.onHover = (info) => this.mapHover(info);
    scene.isTyping = () => {
      const a = document.activeElement;
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
    };
    window.addEventListener('keydown', (e) => this.onKey(e));
    // First interaction unlocks audio.
    const unlock = (): void => {
      audio.unlock();
      this.applySettings();
    };
    window.addEventListener('pointerdown', unlock, { once: false, capture: true });
    window.addEventListener('keydown', unlock, { once: false, capture: true });
    this.applySettings();
    // Keep floating panels clear of the bottom bar whatever its height.
    const bottom = document.getElementById('bottombar')!;
    const sync = (): void => document.documentElement.style.setProperty('--bottombar-h', `${bottom.offsetHeight}px`);
    new ResizeObserver(sync).observe(bottom);
    sync();
  }

  /** Called every frame: re-render HUD when the state has changed. */
  frame(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.hud.update();
    this.bar.update();
    this.info.update();
    this.panels.refresh();
    if (this.started) this.tutorial.update();
  }

  showTitle(): void {
    this.ctrl.setSpeed(0);
    this.menus.title();
  }

  startPlaying(isNew: boolean): void {
    this.started = true;
    closeAllModals();
    this.ctrl.setSpeed(1);
    if (isNew && this.ctrl.meta.settings.tutorialDone) toast(`Welcome to ${this.ctrl.state.seed}! Build farms, houses and a lumber mill to start.`, 'info', 5000);
    this.tutorial.restartIfNeeded();
    this.dirty = true;
  }

  applySettings(): void {
    const st = this.ctrl.meta.settings;
    document.documentElement.style.setProperty('--ui-scale', String(st.uiScale));
    this.audio.setVolumes(st.music, st.sfx);
  }

  private mapHover(info: HoverInfo | null): void {
    const mode = this.ctrl.buildMode;
    if (!info || !mode || modalOpen()) {
      if (mode || !info) hideTip();
      return;
    }
    const { state, world } = this.ctrl;
    const check = canPlace(state, world, mode, info.x, info.y);
    const site = previewSite(state, world, mode, info.x, info.y);
    const name = BUILDINGS[mode].name;
    let html = `<h4>${name}</h4>`;
    if (check.ok) html += site !== 1 ? `<div class="${site >= 1 ? 'pos' : 'neg'}">Yield here ×${site.toFixed(2)}</div>` : '<div class="pos">Click to build</div>';
    else html += `<div class="neg">${check.reason}</div>`;
    showTip(html, info.screenX, info.screenY);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.scene.isTyping()) return;
    const k = e.key;
    // Event choices take priority.
    if (this.ctrl.state.pendingEvent && /^[1-3]$/.test(k)) {
      this.ctrl.chooseEvent(Number(k) - 1);
      return;
    }
    if (k === 'Escape') {
      if (closeTopModal()) return;
      if (this.ctrl.buildMode) return this.ctrl.setBuildMode(null);
      if (this.ctrl.selection) return this.ctrl.select(null);
      if (this.started && !modalOpen()) this.menus.main();
      return;
    }
    if (modalOpen() && !['r', 'R', 't', 'T', 'g', 'G'].includes(k)) return;
    if (!this.started) return;
    switch (k) {
      case ' ':
        e.preventDefault();
        this.ctrl.togglePause();
        break;
      case '1':
      case '2':
      case '3':
        this.ctrl.setSpeed(Number(k));
        break;
      case 'r':
      case 'R':
        closeAllModalsIfLive();
        this.panels.research();
        break;
      case 't':
      case 'T':
        closeAllModalsIfLive();
        this.panels.economy();
        break;
      case 'g':
      case 'G':
        closeAllModalsIfLive();
        this.panels.goals();
        break;
      case 'u':
      case 'U':
        if (this.ctrl.selection) this.ctrl.upgradeAt(this.ctrl.selection.x, this.ctrl.selection.y);
        break;
      case 'Delete':
      case 'Backspace': {
        const s = this.ctrl.selection;
        if (s && buildingAt(this.ctrl.state, s.x, s.y)) {
          this.ctrl.demolishAt(s.x, s.y);
          this.ctrl.select(null);
        }
        break;
      }
      case 'h':
      case 'H':
        this.menus.help();
        break;
    }
    function closeAllModalsIfLive(): void {
      while (closeTopModal()) {
        /* close dismissable modals */
      }
    }
  }
}
