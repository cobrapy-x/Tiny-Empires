import Phaser from 'phaser';
import { isActive, levelDef, siteMultiplier } from '../core/buildingSystem';
import { Terrain, type ResourceKey, type World } from '../core/types';
import type { GameController } from '../game/GameController';
import { makeCanvas, TILE } from './sprites';

const RES_COLOR: Record<ResourceKey, string> = {
  food: '#ffe27a',
  wood: '#e3b07a',
  stone: '#d9d9e3',
  gold: '#ffd23f',
  knowledge: '#9fd8ff',
};

/** Ambient & feedback effects: clouds, sparkles, smoke, floating text, dust. */
export class Effects {
  private waterTiles: number[] = [];
  private clouds: Phaser.GameObjects.Image[] = [];
  private sparkleTimer = 0;
  private smokeTimer = 0;
  private worldPx = 0;
  private size = 0;

  constructor(private scene: Phaser.Scene) {
    const add = (key: string, c: HTMLCanvasElement): void => {
      if (!scene.textures.exists(key)) scene.textures.addCanvas(key, c);
    };
    const [px, pg] = makeCanvas(2, 2);
    pg.fillStyle = '#ffffff';
    pg.fillRect(0, 0, 2, 2);
    add('px', px);
    const [sp, sg] = makeCanvas(5, 5);
    sg.fillStyle = '#ffffff';
    sg.fillRect(2, 0, 1, 5);
    sg.fillRect(0, 2, 5, 1);
    add('sparkle', sp);
    const [cl, cg] = makeCanvas(96, 48);
    for (let i = 0; i < 9; i++) {
      const x = 20 + ((i * 37) % 56);
      const y = 18 + ((i * 13) % 14);
      const rad = 12 + ((i * 7) % 9);
      const grad = cg.createRadialGradient(x, y, 1, x, y, rad);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      cg.fillStyle = grad;
      cg.fillRect(0, 0, 96, 48);
    }
    add('cloud', cl);
  }

  private get motion(): boolean {
    return !(this.scene as unknown as { ctrl: GameController }).ctrl.meta.settings.reducedMotion;
  }

  reset(world: World): void {
    this.size = world.size;
    this.worldPx = world.size * TILE;
    this.waterTiles = [];
    for (let i = 0; i < world.size * world.size; i++) {
      const t = world.terrain[i];
      if (t === Terrain.Shallow || t === Terrain.River || (t === Terrain.Deep && i % 3 === 0)) this.waterTiles.push(i);
    }
    for (const c of this.clouds) c.destroy();
    this.clouds = [];
    for (let i = 0; i < 4; i++) {
      const c = this.scene.add
        .image(Math.random() * this.worldPx, Math.random() * this.worldPx, 'cloud')
        .setDepth(150000)
        .setScale(2 + Math.random() * 1.5)
        .setAlpha(0.18);
      this.clouds.push(c);
    }
  }

  update(dt: number, night: number): void {
    const motion = this.motion;
    for (const c of this.clouds) {
      c.setVisible(motion);
      c.x += dt * 0.006;
      c.y += dt * 0.0015;
      if (c.x > this.worldPx + 200) {
        c.x = -200;
        c.y = Math.random() * this.worldPx;
      }
      c.setAlpha(0.16 * (1 - night * 0.6));
    }
    if (!motion) return;
    this.sparkleTimer += dt;
    if (this.sparkleTimer > 90 && this.waterTiles.length) {
      this.sparkleTimer = 0;
      const i = this.waterTiles[Math.floor(Math.random() * this.waterTiles.length)];
      this.sparkle((i % this.size) * TILE + Math.random() * TILE, Math.floor(i / this.size) * TILE + Math.random() * TILE);
    }
  }

  private sparkle(x: number, y: number): void {
    const s = this.scene.add.image(x, y, 'sparkle').setDepth(6).setAlpha(0).setScale(0.6);
    this.scene.tweens.add({ targets: s, alpha: 0.8, duration: 400, yoyo: true, onComplete: () => s.destroy() });
  }

  onTick(ctrl: GameController): void {
    if (!this.motion) return;
    const { state, world } = ctrl;
    // Chimney smoke
    this.smokeTimer++;
    if (this.smokeTimer % 2 === 0) {
      const homes = state.buildings.filter((b) => isActive(b) && (b.type === 'house' || b.type === 'townhall' || b.type === 'lumbermill'));
      for (let k = 0; k < Math.min(3, homes.length); k++) {
        const b = homes[Math.floor(Math.random() * homes.length)];
        this.smoke(b.x * TILE + 11, b.y * TILE - 2);
      }
    }
    // Production pop-ups
    if (state.tick % 10 === 0) {
      const producers = state.buildings.filter((b) => b.construction === 0 && levelDef(b.type, b.level).produces && b.type !== 'townhall');
      for (let k = 0; k < Math.min(3, producers.length); k++) {
        const b = producers[Math.floor(Math.random() * producers.length)];
        const def = levelDef(b.type, b.level);
        const [res, amt] = Object.entries(def.produces!)[0] as [ResourceKey, number];
        const v = amt * 10 * siteMultiplier(state, world, b) * (def.workers ? ctrl.report.workforce : 1);
        if (v >= 0.5) this.floatText(b.x * TILE + 8, b.y * TILE + 12, `+${Math.round(v)} ${res}`, RES_COLOR[res], true);
      }
    }
  }

  private smoke(x: number, y: number): void {
    const p = this.scene.add.image(x, y, 'px').setTint(0xdddddd).setAlpha(0.7).setDepth(140000);
    this.scene.tweens.add({ targets: p, y: y - 10, x: x + 3, alpha: 0, scale: 2, duration: 1800, onComplete: () => p.destroy() });
  }

  floatText(x: number, y: number, text: string, color: string, small = false): void {
    const zoom = this.scene.cameras.main.zoom;
    const t = this.scene.add
      .text(x, y, text, {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: small ? '6px' : '7px',
        fontStyle: 'bold',
        color,
        stroke: '#1b1724',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(210000)
      .setResolution(Math.min(8, Math.ceil(zoom * (window.devicePixelRatio || 1))));
    this.scene.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: small ? 1400 : 2000, ease: 'Sine.Out', onComplete: () => t.destroy() });
  }

  dust(x: number, y: number, tint = 0xe8d9b5): void {
    if (!this.motion) return;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const p = this.scene.add.image(x, y, 'px').setTint(tint).setDepth(140000).setAlpha(0.9);
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(a) * 10,
        y: y + Math.sin(a) * 5 - 3,
        alpha: 0,
        duration: 500 + Math.random() * 200,
        ease: 'Quad.Out',
        onComplete: () => p.destroy(),
      });
    }
  }
}
