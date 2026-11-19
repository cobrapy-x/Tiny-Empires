import Phaser from 'phaser';
import './ui/styles.css';
import { AudioEngine } from './audio/AudioEngine';
import { randomSeedString } from './core/rng';
import { GameController } from './game/GameController';
import { WorldScene } from './render/WorldScene';
import { UI } from './ui/UI';

const ctrl = new GameController();
// Show the last island behind the title screen if there is one; otherwise a fresh one.
if (ctrl.loadSlot('auto') !== null) ctrl.newGame(randomSeedString(), 64);
ctrl.setSpeed(0);

const audio = new AudioEngine();
const scene = new WorldScene();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1d4575',
  pixelArt: true,
  roundPixels: false,
  antialias: false,
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  input: { activePointers: 3 },
  disableContextMenu: true,
  banner: false,
  fps: { target: 60, smoothStep: true },
});

game.scene.add('world', scene, true, { ctrl });

let ui: UI | null = null;
game.events.once(Phaser.Core.Events.READY, () => {
  ui = new UI(ctrl, scene, audio);
  ui.showTitle();
  document.getElementById('loading')?.classList.add('done');
  window.setTimeout(() => document.getElementById('loading')?.remove(), 600);
});

game.events.on(Phaser.Core.Events.STEP, (_time: number, delta: number) => {
  if (!ui) return;
  ctrl.update(delta);
  ui.frame();
});

document.addEventListener('visibilitychange', () => {
  const hidden = document.visibilityState === 'hidden';
  audio.suspend(hidden);
  if (hidden && ctrl.state && ctrl.meta.settings.autosave && ctrl.state.tick > 0) ctrl.saveSlot('auto');
});
window.addEventListener('pagehide', () => {
  if (ctrl.meta.settings.autosave && ctrl.state.tick > 0) ctrl.saveSlot('auto');
});

// Offline support (production builds only).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline caching is optional */
    });
  });
}

// Handy for debugging and automated QA.
(window as unknown as { __tinyEmpires: unknown }).__tinyEmpires = { ctrl, game, scene };
