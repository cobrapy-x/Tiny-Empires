import type { GameController } from '../game/GameController';
import { $, clear, h } from './dom';

interface Step {
  text: string;
  /** Element to highlight: a building type or `tool:<name>`. */
  highlight?: string;
  /** Step completes automatically once this returns true. */
  done?: (c: GameController) => boolean;
}

const has = (c: GameController, type: string): boolean => c.state.buildings.some((b) => b.type === type);

export const STEPS: Step[] = [
  { text: 'Welcome, leader! Your people have landed on a new island. <b>Drag</b> the map to look around and <b>scroll or pinch</b> to zoom. The Town Hall is your home base.' },
  { text: 'Food comes first. Pick the <b>Farm</b> from the build bar, then click a bright green tile near your Town Hall. Tip: tiles touching a <b>river</b> grow 40% more food!', highlight: 'farm', done: (c) => has(c, 'farm') },
  { text: 'Now wood. Build a <b>Lumber Mill</b> right next to a forest — every adjacent forest tile adds more wood.', highlight: 'lumbermill', done: (c) => has(c, 'lumbermill') },
  { text: 'Your people need homes to grow. Build a <b>House</b>. More housing → more people → more workers and taxes.', highlight: 'house', done: (c) => has(c, 'house') },
  { text: 'Buildings need <b>workers</b>. Hover or tap the population and resources in the top bar to see exactly what is produced and consumed.' },
  { text: 'Knowledge unlocks progress. Build a <b>School</b>, then open <b>Research</b> and study a technology once you have enough knowledge.', highlight: 'tool:research', done: (c) => c.state.researched.length > 0 || !!c.state.research },
  { text: 'You are on your way! Use the speed buttons (or <b>Space</b>, <b>1–3</b>) to pause and fast-forward. Your next goals are always shown in the top-left. Good luck!', highlight: 'tool:goals' },
];

export class Tutorial {
  private el = $('#tutorial');
  private lastStep = -1;

  constructor(private ctrl: GameController, private highlight: (t: string | null) => void) {
    this.el.classList.add('panel');
  }

  get active(): boolean {
    return !this.ctrl.meta.settings.tutorialDone;
  }

  update(): void {
    const st = this.ctrl.meta.settings;
    if (st.tutorialDone || this.ctrl.state.pendingEvent) {
      this.el.hidden = true;
      if (st.tutorialDone && this.lastStep !== -2) {
        this.highlight(null);
        this.lastStep = -2;
      }
      return;
    }
    // Auto-advance past steps whose goal is already done.
    while (st.tutorialStep < STEPS.length && STEPS[st.tutorialStep].done?.(this.ctrl)) {
      st.tutorialStep++;
      this.ctrl.meta.save();
      this.ctrl.bus.emit('action', { kind: 'research' });
    }
    if (st.tutorialStep >= STEPS.length) {
      this.finish();
      return;
    }
    this.el.hidden = false;
    if (this.lastStep === st.tutorialStep) return;
    this.lastStep = st.tutorialStep;
    const step = STEPS[st.tutorialStep];
    clear(this.el);
    const last = st.tutorialStep === STEPS.length - 1;
    this.el.append(
      h('div', { class: 'step', text: `Tutorial ${st.tutorialStep + 1} / ${STEPS.length}` }),
      h('p', { html: step.text }),
      h('div', { class: 'row' },
        !step.done ? h('button', { class: 'btn small primary', text: last ? 'Start playing!' : 'Next', onclick: () => this.next() }) : h('span', { class: 'muted', text: 'Do it to continue…' }),
        h('button', { class: 'btn small', text: 'Skip tutorial', onclick: () => this.finish() }),
      ),
    );
    this.highlight(step.highlight ?? null);
  }

  next(): void {
    this.ctrl.meta.settings.tutorialStep++;
    this.ctrl.meta.save();
    this.update();
  }

  finish(): void {
    const st = this.ctrl.meta.settings;
    st.tutorialDone = true;
    this.ctrl.meta.save();
    this.el.hidden = true;
    this.highlight(null);
    this.lastStep = -2;
  }

  restartIfNeeded(): void {
    this.lastStep = -1;
    this.update();
  }
}
