import Phaser from 'phaser';

/**
 * Smooth camera: drag / touch to pan, wheel / pinch to zoom toward the pointer,
 * keyboard (WASD / arrows / Q E) for accessibility.
 */
export class CameraController {
  targetZoom: number;
  minZoom = 1;
  maxZoom = 6;
  private dragStart: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
  private pinchDist = 0;
  /** True while the current pointer gesture has moved enough to count as a pan. */
  dragged = false;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private zoomAnchor: { sx: number; sy: number } | null = null;

  constructor(private scene: Phaser.Scene, private worldPx: number) {
    const cam = scene.cameras.main;
    this.targetZoom = cam.zoom;
    const input = scene.input;
    input.addPointer(1);
    input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    input.on('pointerup', () => this.onUp());
    input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const factor = Math.exp(-dy * 0.0015);
      this.zoomAt(this.targetZoom * factor, p.x, p.y);
    });
    const kb = scene.input.keyboard;
    if (kb) {
      for (const k of ['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'Q', 'E', 'PLUS', 'MINUS']) {
        this.keys[k] = kb.addKey(k, false);
      }
    }
  }

  setWorldSize(px: number): void {
    this.worldPx = px;
  }

  fitZoom(): number {
    const cam = this.scene.cameras.main;
    return Phaser.Math.Clamp(Math.min(cam.width, cam.height) / (16 * 15), 1.5, 4);
  }

  zoomAt(z: number, sx: number, sy: number): void {
    this.targetZoom = Phaser.Math.Clamp(z, this.minZoom, this.maxZoom);
    this.zoomAnchor = { sx, sy };
  }

  zoomBy(factor: number): void {
    const cam = this.scene.cameras.main;
    this.zoomAt(this.targetZoom * factor, cam.width / 2, cam.height / 2);
  }

  centerOn(wx: number, wy: number): void {
    this.scene.cameras.main.centerOn(wx, wy);
    this.clamp();
  }

  private onDown(p: Phaser.Input.Pointer): void {
    const ptrs = this.activePointers();
    if (ptrs.length >= 2) {
      this.pinchDist = Phaser.Math.Distance.Between(ptrs[0].x, ptrs[0].y, ptrs[1].x, ptrs[1].y);
      this.dragged = true;
      this.dragStart = null;
      return;
    }
    const cam = this.scene.cameras.main;
    this.dragStart = { x: p.x, y: p.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
    this.dragged = false;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const ptrs = this.activePointers();
    if (ptrs.length >= 2) {
      const d = Phaser.Math.Distance.Between(ptrs[0].x, ptrs[0].y, ptrs[1].x, ptrs[1].y);
      if (this.pinchDist > 0) {
        const cx = (ptrs[0].x + ptrs[1].x) / 2;
        const cy = (ptrs[0].y + ptrs[1].y) / 2;
        this.zoomAt(this.targetZoom * (d / this.pinchDist), cx, cy);
        this.applyZoomImmediate();
      }
      this.pinchDist = d;
      return;
    }
    if (!this.dragStart || !p.isDown) return;
    const dx = p.x - this.dragStart.x;
    const dy = p.y - this.dragStart.y;
    if (!this.dragged && Math.hypot(dx, dy) < 7) return;
    this.dragged = true;
    const cam = this.scene.cameras.main;
    cam.scrollX = this.dragStart.scrollX - dx / cam.zoom;
    cam.scrollY = this.dragStart.scrollY - dy / cam.zoom;
    this.clamp();
  }

  private onUp(): void {
    if (this.activePointers().length < 2) this.pinchDist = 0;
    this.dragStart = null;
  }

  private activePointers(): Phaser.Input.Pointer[] {
    return this.scene.input.manager.pointers.filter((p) => p.isDown);
  }

  private applyZoomImmediate(): void {
    const cam = this.scene.cameras.main;
    this.setZoomKeepingAnchor(this.targetZoom);
    cam.zoom = this.targetZoom;
  }

  private setZoomKeepingAnchor(z: number): void {
    const cam = this.scene.cameras.main;
    const a = this.zoomAnchor ?? { sx: cam.width / 2, sy: cam.height / 2 };
    const before = cam.getWorldPoint(a.sx, a.sy);
    cam.zoom = z;
    cam.preRender();
    const after = cam.getWorldPoint(a.sx, a.sy);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
  }

  update(dtMs: number, typing: boolean): void {
    const cam = this.scene.cameras.main;
    if (Math.abs(cam.zoom - this.targetZoom) > 0.001) {
      const z = cam.zoom + (this.targetZoom - cam.zoom) * Math.min(1, dtMs / 90);
      this.setZoomKeepingAnchor(Math.abs(z - this.targetZoom) < 0.002 ? this.targetZoom : z);
    }
    if (!typing) {
      const k = this.keys;
      const speed = (dtMs * 0.6) / cam.zoom;
      if (k.W?.isDown || k.UP?.isDown) cam.scrollY -= speed;
      if (k.S?.isDown || k.DOWN?.isDown) cam.scrollY += speed;
      if (k.A?.isDown || k.LEFT?.isDown) cam.scrollX -= speed;
      if (k.D?.isDown || k.RIGHT?.isDown) cam.scrollX += speed;
      if (k.E?.isDown || k.PLUS?.isDown) this.zoomBy(1 + dtMs * 0.002);
      if (k.Q?.isDown || k.MINUS?.isDown) this.zoomBy(1 - dtMs * 0.002);
    }
    this.clamp();
  }

  clamp(): void {
    const cam = this.scene.cameras.main;
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const margin = 64;
    const midX = cam.scrollX + cam.width / 2;
    const midY = cam.scrollY + cam.height / 2;
    // Phaser scroll is offset by half the viewport when zoomed; work in centre coordinates.
    const cx = Phaser.Math.Clamp(midX, -margin + viewW / 2, this.worldPx + margin - viewW / 2);
    const cy = Phaser.Math.Clamp(midY, -margin + viewH / 2, this.worldPx + margin - viewH / 2);
    if (viewW > this.worldPx + margin * 2) cam.scrollX = this.worldPx / 2 - cam.width / 2;
    else cam.scrollX = cx - cam.width / 2;
    if (viewH > this.worldPx + margin * 2) cam.scrollY = this.worldPx / 2 - cam.height / 2;
    else cam.scrollY = cy - cam.height / 2;
  }
}
