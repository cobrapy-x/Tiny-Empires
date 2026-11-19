import Phaser from 'phaser';
import { DAY_LENGTH } from '../config/balance';
import { BUILDINGS } from '../config/buildings';
import { canPlace, isActive, territory, terrainAllows } from '../core/buildingSystem';
import type { Building, BuildingType } from '../core/types';
import type { GameController } from '../game/GameController';
import { CameraController } from './CameraController';
import { Effects } from './Effects';
import { drawBuilding, drawScaffold, makeCanvas, TILE } from './sprites';
import { renderTerrain } from './terrainRenderer';

interface BuildingView {
  sprite: Phaser.GameObjects.Image;
  key: string;
  bar?: Phaser.GameObjects.Graphics;
  glow?: Phaser.GameObjects.Image;
}

export interface HoverInfo {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
}

export class WorldScene extends Phaser.Scene {
  ctrl!: GameController;
  camCtl!: CameraController;
  private fx!: Effects;
  private terrain?: Phaser.GameObjects.Image;
  private views = new Map<number, BuildingView>();
  private overlay!: Phaser.GameObjects.Graphics;
  private hoverGfx!: Phaser.GameObjects.Graphics;
  private selectGfx!: Phaser.GameObjects.Graphics;
  private ghost!: Phaser.GameObjects.Image;
  private night!: Phaser.GameObjects.Rectangle;
  private hover: { x: number; y: number } | null = null;
  private overlayDirty = true;
  private lastBuildingCount = -1;
  onHover: (info: HoverInfo | null) => void = () => {};
  isTyping: () => boolean = () => false;

  constructor() {
    super('world');
  }

  init(data: { ctrl: GameController }): void {
    this.ctrl = data.ctrl;
  }

  create(): void {
    this.makeTextures();
    this.overlay = this.add.graphics().setDepth(5);
    this.hoverGfx = this.add.graphics().setDepth(100000);
    this.selectGfx = this.add.graphics().setDepth(100001);
    this.ghost = this.add.image(0, 0, 'b_house_1').setOrigin(0.5, 1).setAlpha(0.75).setVisible(false).setDepth(100002);
    this.night = this.add
      .rectangle(0, 0, 10, 10, 0x0b1036, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(200000);
    this.fx = new Effects(this);
    this.camCtl = new CameraController(this, this.ctrl.world.size * TILE);
    this.input.mouse?.disableContextMenu();

    this.buildWorld();

    const bus = this.ctrl.bus;
    bus.on('world', () => this.buildWorld());
    bus.on('changed', () => this.syncBuildings());
    bus.on('buildMode', () => {
      this.overlayDirty = true;
      this.updateGhost();
    });
    bus.on('select', () => this.drawSelection());
    bus.on('float', (f) => this.fx.floatText(f.x * TILE + 8, f.y * TILE, f.text, f.color));
    bus.on('action', (a) => {
      if (a.kind === 'place' && a.x !== undefined && a.y !== undefined) this.fx.dust(a.x * TILE + 8, a.y * TILE + 14);
      if (a.kind === 'demolish' && a.x !== undefined && a.y !== undefined) this.fx.dust(a.x * TILE + 8, a.y * TILE + 14, 0x9a8a7a);
    });
    bus.on('tick', () => this.onTick());

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onPointerUp(p));
    this.input.on('gameout', () => {
      this.hover = null;
      this.updateGhost();
      this.onHover(null);
    });
    this.scale.on('resize', () => this.camCtl.clamp());
  }

  private makeTextures(): void {
    for (const type of Object.keys(BUILDINGS) as BuildingType[]) {
      BUILDINGS[type].levels.forEach((_, i) => this.addCanvasTexture(`b_${type}_${i + 1}`, drawBuilding(type, i + 1)));
    }
    [0.2, 0.5, 0.8].forEach((p, i) => this.addCanvasTexture(`scaffold_${i}`, drawScaffold(p)));
    // Soft glow for lit windows at night.
    const [glow, g] = makeCanvas(24, 24);
    const grad = g.createRadialGradient(12, 12, 1, 12, 12, 12);
    grad.addColorStop(0, 'rgba(255,214,120,0.9)');
    grad.addColorStop(1, 'rgba(255,214,120,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 24, 24);
    this.addCanvasTexture('glow', glow);
  }

  private addCanvasTexture(key: string, canvas: HTMLCanvasElement): void {
    if (this.textures.exists(key)) this.textures.remove(key);
    this.textures.addCanvas(key, canvas);
  }

  private buildWorld(): void {
    const world = this.ctrl.world;
    this.addCanvasTexture('terrain', renderTerrain(world));
    if (this.terrain) this.terrain.setTexture('terrain');
    else this.terrain = this.add.image(0, 0, 'terrain').setOrigin(0, 0).setDepth(0);
    for (const v of this.views.values()) this.destroyView(v);
    this.views.clear();
    this.lastBuildingCount = -1;
    this.overlayDirty = true;
    this.camCtl.setWorldSize(world.size * TILE);
    const cam = this.cameras.main;
    cam.setZoom(this.camCtl.fitZoom());
    this.camCtl.targetZoom = cam.zoom;
    const th = this.ctrl.state.buildings.find((b) => b.type === 'townhall')!;
    this.camCtl.centerOn(th.x * TILE + 8, th.y * TILE + 8);
    this.fx.reset(world);
    this.syncBuildings();
    this.drawSelection();
  }

  private destroyView(v: BuildingView): void {
    v.sprite.destroy();
    v.bar?.destroy();
    v.glow?.destroy();
  }

  private textureFor(b: Building): string {
    if (b.construction > 0 && b.upgradeTo === 0) {
      const p = 1 - b.construction / Math.max(1, b.constructionTotal);
      return `scaffold_${p < 0.33 ? 0 : p < 0.66 ? 1 : 2}`;
    }
    return `b_${b.type}_${b.level}`;
  }

  /** Create, update or remove sprites so they match the game state. */
  syncBuildings(): void {
    const seen = new Set<number>();
    for (const b of this.ctrl.state.buildings) {
      seen.add(b.id);
      const key = this.textureFor(b);
      let v = this.views.get(b.id);
      const px = b.x * TILE + TILE / 2;
      const py = b.y * TILE + TILE + 2;
      if (!v) {
        const sprite = this.add.image(px, py, key).setOrigin(0.5, 1).setDepth(10 + py + b.x * 0.001);
        v = { sprite, key };
        this.views.set(b.id, v);
        if (!this.ctrl.meta.settings.reducedMotion) {
          sprite.setScale(1, 0.6);
          this.tweens.add({ targets: sprite, scaleY: 1, duration: 260, ease: 'Back.Out' });
        }
      } else if (v.key !== key) {
        v.sprite.setTexture(key);
        v.key = key;
        if (!this.ctrl.meta.settings.reducedMotion && key.startsWith('b_')) {
          v.sprite.setScale(1.15, 0.85);
          this.tweens.add({ targets: v.sprite, scaleX: 1, scaleY: 1, duration: 300, ease: 'Back.Out' });
        }
      }
      // Construction progress bar
      if (b.construction > 0) {
        if (!v.bar) v.bar = this.add.graphics().setDepth(90000);
        const p = 1 - b.construction / Math.max(1, b.constructionTotal);
        v.bar.clear();
        v.bar.fillStyle(0x1b1724, 0.85).fillRect(b.x * TILE + 1, b.y * TILE - 9, 14, 3);
        v.bar.fillStyle(b.upgradeTo ? 0x7fd3ff : 0xffd35a, 1).fillRect(b.x * TILE + 2, b.y * TILE - 8, Math.max(1, Math.round(12 * p)), 1);
      } else if (v.bar) {
        v.bar.destroy();
        v.bar = undefined;
      }
      // Night glow for lived-in buildings
      const lit = isActive(b) && ['house', 'townhall', 'school', 'market', 'temple', 'lighthouse', 'warehouse', 'lumbermill'].includes(b.type);
      if (lit && !v.glow) {
        v.glow = this.add
          .image(px, py - (b.type === 'lighthouse' ? 40 : 8), 'glow')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(200001)
          .setAlpha(0)
          .setScale(b.type === 'lighthouse' ? 3 : 1);
      } else if (!lit && v.glow) {
        v.glow.destroy();
        v.glow = undefined;
      }
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.destroyView(v);
        this.views.delete(id);
      }
    }
    if (this.ctrl.state.buildings.length !== this.lastBuildingCount) {
      this.lastBuildingCount = this.ctrl.state.buildings.length;
      this.overlayDirty = true;
    }
    this.drawSelection();
    this.updateGhost();
  }

  private onTick(): void {
    this.fx.onTick(this.ctrl);
  }

  private tileAt(p: Phaser.Input.Pointer): { x: number; y: number } | null {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const x = Math.floor(wp.x / TILE);
    const y = Math.floor(wp.y / TILE);
    if (x < 0 || y < 0 || x >= this.ctrl.world.size || y >= this.ctrl.world.size) return null;
    return { x, y };
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    const t = this.tileAt(p);
    const changed = t?.x !== this.hover?.x || t?.y !== this.hover?.y;
    this.hover = t;
    if (changed) this.updateGhost();
    this.onHover(t ? { ...t, screenX: p.x, screenY: p.y } : null);
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (this.camCtl.dragged) return;
    if (p.rightButtonReleased()) {
      if (this.ctrl.buildMode) this.ctrl.setBuildMode(null);
      else this.ctrl.select(null);
      return;
    }
    const t = this.tileAt(p);
    if (t) this.ctrl.clickTile(t.x, t.y);
  }

  private updateGhost(): void {
    const g = this.hoverGfx;
    g.clear();
    const mode = this.ctrl.buildMode;
    if (!this.hover) {
      this.ghost.setVisible(false);
      return;
    }
    const { x, y } = this.hover;
    if (mode) {
      const ok = canPlace(this.ctrl.state, this.ctrl.world, mode, x, y).ok;
      this.ghost
        .setTexture(`b_${mode}_1`)
        .setPosition(x * TILE + TILE / 2, y * TILE + TILE + 2)
        .setTint(ok ? 0xc8ffc8 : 0xff8080)
        .setVisible(true);
      g.lineStyle(1, ok ? 0x9cff9c : 0xff6b6b, 1).strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1);
    } else {
      this.ghost.setVisible(false);
      g.lineStyle(1, 0xffffff, 0.7).strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1);
    }
  }

  private drawSelection(): void {
    const g = this.selectGfx;
    g.clear();
    const s = this.ctrl.selection;
    if (!s) return;
    g.lineStyle(1, 0xffe066, 1).strokeRect(s.x * TILE + 0.5, s.y * TILE + 0.5, TILE - 1, TILE - 1);
    g.fillStyle(0xffe066, 0.15).fillRect(s.x * TILE, s.y * TILE, TILE, TILE);
  }

  /** Highlights tiles where the current building type could go. */
  private drawOverlay(): void {
    this.overlayDirty = false;
    const g = this.overlay;
    g.clear();
    const mode = this.ctrl.buildMode;
    if (!mode) return;
    const { state, world } = this.ctrl;
    const mask = territory(state, world.size);
    const occupied = new Set(state.buildings.map((b) => b.y * world.size + b.x));
    for (let y = 0; y < world.size; y++) {
      for (let x = 0; x < world.size; x++) {
        const i = y * world.size + x;
        if (!mask[i]) continue;
        const ok = !occupied.has(i) && terrainAllows(world, mode, x, y).ok;
        if (ok) g.fillStyle(0x8dff8d, 0.22).fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
        // territory border
        const edge = (dx: number, dy: number): boolean => {
          const nx = x + dx;
          const ny = y + dy;
          return nx < 0 || ny < 0 || nx >= world.size || ny >= world.size || !mask[ny * world.size + nx];
        };
        g.fillStyle(0xffffff, 0.45);
        if (edge(0, -1)) g.fillRect(x * TILE, y * TILE, TILE, 1);
        if (edge(0, 1)) g.fillRect(x * TILE, y * TILE + TILE - 1, TILE, 1);
        if (edge(-1, 0)) g.fillRect(x * TILE, y * TILE, 1, TILE);
        if (edge(1, 0)) g.fillRect(x * TILE + TILE - 1, y * TILE, 1, TILE);
      }
    }
  }

  /** 0 = full day, 1 = deepest night. */
  nightAmount(): number {
    const t = ((this.ctrl.state.tick + this.ctrl.tickFraction) % DAY_LENGTH) / DAY_LENGTH;
    // Day for the first ~60% of the cycle, then dusk → night → dawn.
    if (t < 0.55) return 0;
    if (t < 0.68) return (t - 0.55) / 0.13;
    if (t < 0.9) return 1;
    return 1 - (t - 0.9) / 0.1;
  }

  update(_time: number, delta: number): void {
    this.camCtl.update(delta, this.isTyping());
    if (this.overlayDirty) this.drawOverlay();
    const n = this.nightAmount();
    const cam = this.cameras.main;
    this.night.setSize(cam.width, cam.height).setFillStyle(0x0b1036, n * 0.42);
    const pulse = 0.85 + Math.sin(_time / 400) * 0.15;
    for (const v of this.views.values()) if (v.glow) v.glow.setAlpha(n * 0.75 * pulse);
    this.ghost.setAlpha(0.6 + Math.sin(_time / 180) * 0.15);
    this.fx.update(delta, n);
  }
}
