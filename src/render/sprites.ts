/**
 * Procedural pixel-art sprites, drawn with canvas rectangles at native
 * resolution (16 px tiles). All artwork is original and generated at runtime.
 */
import type { BuildingType } from '../core/types';
import { C } from './palette';

export const TILE = 16;
export const SPRITE_W = 16;
export const SPRITE_H = 26;

type G = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, G] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

const r = (g: G, x: number, y: number, w: number, h: number, col: string): void => {
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
};

function shadow(g: G, x: number, y: number, w: number): void {
  r(g, x + 1, y, w - 2, 1, C.shadow);
  r(g, x, y - 1, w, 1, C.shadow);
}

/** Front wall with darker base line and right edge. */
function wall(g: G, x: number, y: number, w: number, h: number, col: string, dark: string): void {
  r(g, x, y, w, h, col);
  r(g, x + w - 1, y, 1, h, dark);
  r(g, x, y + h - 1, w, 1, dark);
}

/** 3/4-view pitched roof: lighter back slope, darker front slope, outline eave. */
function roof(g: G, x: number, y: number, w: number, h: number, col: string, dark: string): void {
  const back = Math.ceil(h / 2);
  r(g, x + 1, y, w - 2, 1, dark);
  r(g, x, y + 1, w, back - 1, col);
  r(g, x, y + back, w, h - back, dark);
  r(g, x, y + h - 1, w, 1, C.outline);
  // shingle texture
  for (let i = x + 1; i < x + w - 1; i += 3) r(g, i, y + back + 1, 1, Math.max(1, h - back - 2), col);
}

/** Front gable triangle (for a pointed facade). */
function gable(g: G, cx: number, y: number, halfW: number, col: string, dark: string): void {
  for (let i = 0; i <= halfW; i++) {
    r(g, cx - i, y + i, i * 2 + 1, 1, col);
    r(g, cx - i, y + i, 1, 1, dark);
    r(g, cx + i, y + i, 1, 1, dark);
  }
}

function win(g: G, x: number, y: number, lit = true): void {
  r(g, x, y, 2, 2, lit ? C.window : C.windowDark);
  r(g, x, y + 2, 2, 1, C.outline);
}

function door(g: G, x: number, y: number, h = 3): void {
  r(g, x, y, 2, h, C.door);
  r(g, x, y, 2, 1, C.outline);
}

function chimney(g: G, x: number, y: number): void {
  r(g, x, y, 2, 3, C.stoneDark);
  r(g, x, y, 2, 1, C.outline);
}

function flag(g: G, x: number, y: number, col: string = C.flag): void {
  r(g, x, y, 1, 7, C.woodDark);
  r(g, x + 1, y, 3, 2, col);
  r(g, x + 1, y + 2, 2, 1, col);
}

function crate(g: G, x: number, y: number): void {
  r(g, x, y, 3, 3, C.woodLight);
  r(g, x, y + 2, 3, 1, C.woodDark);
  r(g, x + 1, y, 1, 3, C.wood);
}

function log(g: G, x: number, y: number): void {
  r(g, x, y, 4, 2, C.wood);
  r(g, x, y, 1, 2, C.woodLight);
  r(g, x + 3, y + 1, 1, 1, C.woodDark);
}

const B = 24; // ground line (bottom of tile in sprite space)

const DRAW: Record<BuildingType, (g: G, level: number) => void> = {
  house(g, lv) {
    if (lv === 1) {
      shadow(g, 2, B, 12);
      wall(g, 3, 16, 10, 7, C.woodLight, C.woodDark);
      for (let y = 17; y < 22; y += 2) r(g, 3, y, 9, 1, C.wood);
      roof(g, 2, 10, 12, 7, C.roofBrown, C.roofBrownDark);
      door(g, 6, 19, 4);
      win(g, 9, 18);
    } else if (lv === 2) {
      shadow(g, 1, B, 14);
      wall(g, 2, 15, 12, 8, C.plaster, C.plasterDark);
      r(g, 2, 21, 12, 2, C.stone);
      chimney(g, 10, 7);
      roof(g, 1, 9, 14, 7, C.roofRed, C.roofRedDark);
      door(g, 7, 19, 4);
      win(g, 4, 17);
      win(g, 10, 17);
    } else {
      shadow(g, 1, B, 14);
      wall(g, 2, 11, 12, 12, C.plaster, C.plasterDark);
      r(g, 2, 21, 12, 2, C.stone);
      r(g, 2, 16, 12, 1, C.woodDark);
      chimney(g, 11, 3);
      roof(g, 1, 5, 14, 7, C.roofBlue, C.roofBlueDark);
      door(g, 7, 19, 4);
      win(g, 4, 13);
      win(g, 10, 13);
      win(g, 4, 18);
      win(g, 10, 18);
    }
  },
  farm(g, lv) {
    // Fields fill the tile; small barn on top.
    const rows = lv === 1 ? 3 : lv === 2 ? 4 : 5;
    r(g, 0, 13, 16, 11, C.soil);
    for (let i = 0; i < rows; i++) {
      const y = 23 - i * 2;
      r(g, 1, y - 1, 14, 1, C.wheat);
      for (let x = 1; x < 15; x += 2) r(g, x, y - 2, 1, 1, C.wheatDark);
    }
    r(g, 0, 13, 16, 1, C.soilDark);
    if (lv === 1) {
      wall(g, 2, 9, 6, 4, C.woodLight, C.woodDark);
      roof(g, 1, 6, 8, 4, C.roofBrown, C.roofBrownDark);
    } else {
      wall(g, 2, 8, 8, 5, C.roofRed, C.roofRedDark);
      r(g, 5, 10, 2, 3, C.door);
      roof(g, 1, 4, 10, 5, C.roofBrown, C.roofBrownDark);
      if (lv === 3) {
        r(g, 12, 4, 3, 9, C.stoneLight);
        r(g, 14, 4, 1, 9, C.stoneDark);
        r(g, 12, 3, 3, 1, C.roofBlue);
      }
    }
  },
  lumbermill(g, lv) {
    shadow(g, 1, B, 14);
    wall(g, 2, 14, 10, 8, C.wood, C.woodDark);
    for (let y = 15; y < 21; y += 2) r(g, 2, y, 9, 1, C.woodDark);
    roof(g, 1, 9, 12, 6, C.roofGreen, C.roofGreenDark);
    door(g, 5, 18, 4);
    log(g, 10, 21);
    log(g, 11, 19);
    log(g, 12, 22);
    if (lv >= 2) {
      // saw wheel
      r(g, 12, 11, 4, 4, C.stoneLight);
      r(g, 13, 12, 2, 2, C.stoneDark);
      r(g, 1, 20, 3, 3, C.trunk);
    }
  },
  quarry(g, lv) {
    r(g, 2, 17, 12, 6, C.stoneDark);
    r(g, 3, 18, 10, 4, '#5f5c5a');
    // stone blocks
    r(g, 1, 20, 4, 3, C.stoneLight);
    r(g, 1, 22, 4, 1, C.stoneDark);
    r(g, 11, 19, 4, 4, C.stoneLight);
    r(g, 11, 22, 4, 1, C.stoneDark);
    r(g, 7, 21, 3, 2, C.stone);
    // crane
    r(g, 4, 7, 1, 11, C.woodDark);
    r(g, 4, 7, 9, 1, C.woodDark);
    r(g, 12, 8, 1, 6, C.outline);
    r(g, 11, 14, 3, 2, C.stone);
    if (lv >= 2) {
      r(g, 8, 12, 5, 3, C.woodLight);
      r(g, 8, 15, 1, 1, C.outline);
      r(g, 12, 15, 1, 1, C.outline);
      r(g, 9, 11, 3, 1, C.stoneLight);
    }
  },
  market(g, lv) {
    shadow(g, 0, B, 16);
    const awning = (x: number, y: number, w: number, col: string): void => {
      for (let i = 0; i < w; i++) r(g, x + i, y, 1, 3, i % 2 ? C.white : col);
      r(g, x, y + 3, w, 1, C.outline);
      r(g, x, y + 4, 1, 4, C.woodDark);
      r(g, x + w - 1, y + 4, 1, 4, C.woodDark);
      r(g, x + 1, y + 6, w - 2, 2, C.woodLight);
    };
    if (lv === 1) {
      awning(1, 13, 7, C.roofRed);
      awning(8, 15, 7, C.roofBlue);
      r(g, 3, 18, 2, 1, C.wheat);
      r(g, 10, 20, 2, 1, '#e06d6d');
      crate(g, 12, 21);
    } else {
      wall(g, 2, 9, 12, 7, C.plaster, C.plasterDark);
      roof(g, 1, 4, 14, 6, C.roofRed, C.roofRedDark);
      flag(g, 13, 0, C.gold);
      awning(1, 15, 7, '#d9a03a');
      awning(8, 15, 7, C.roofGreen);
      r(g, 3, 20, 2, 1, C.gold);
      crate(g, 12, 21);
    }
  },
  school(g, lv) {
    shadow(g, 1, B, 14);
    const roofCol = lv === 1 ? C.roofRed : C.roofBlue;
    const roofDark = lv === 1 ? C.roofRedDark : C.roofBlueDark;
    wall(g, 2, 13, 12, 10, C.plaster, C.plasterDark);
    roof(g, 1, 8, 14, 6, roofCol, roofDark);
    // bell tower
    r(g, 6, 3, 4, 6, C.plaster);
    r(g, 7, 4, 2, 2, C.gold);
    r(g, 5, 2, 6, 1, roofDark);
    r(g, 6, 1, 4, 1, roofCol);
    door(g, 7, 19, 4);
    win(g, 3, 16);
    win(g, 11, 16);
    if (lv >= 2) {
      win(g, 3, 20, true);
      win(g, 11, 20, true);
    }
    if (lv >= 3) {
      r(g, 6, 0, 4, 1, C.gold);
      r(g, 1, 13, 1, 10, C.stoneLight);
      r(g, 14, 13, 1, 10, C.stoneLight);
    }
  },
  warehouse(g, lv) {
    shadow(g, 0, B, 16);
    const wallC = lv === 1 ? C.wood : C.stone;
    const wallD = lv === 1 ? C.woodDark : C.stoneDark;
    wall(g, 1, 14, 14, 9, wallC, wallD);
    if (lv === 1) for (let x = 2; x < 14; x += 3) r(g, x, 14, 1, 8, C.woodDark);
    roof(g, 0, 8, 16, 7, lv === 1 ? C.roofBrown : C.roofGreen, lv === 1 ? C.roofBrownDark : C.roofGreenDark);
    r(g, 5, 16, 6, 7, C.door);
    r(g, 5, 16, 6, 1, C.outline);
    r(g, 7, 16, 1, 7, C.woodDark);
    crate(g, 0, 21);
    crate(g, 13, 21);
  },
  townhall(g, lv) {
    shadow(g, 0, B, 16);
    if (lv === 1) {
      wall(g, 1, 14, 14, 9, C.woodLight, C.woodDark);
      for (let y = 15; y < 22; y += 2) r(g, 1, y, 13, 1, C.wood);
      roof(g, 0, 7, 16, 8, C.roofBrown, C.roofBrownDark);
      door(g, 7, 19, 4);
      win(g, 3, 17);
      win(g, 11, 17);
      flag(g, 7, 0);
    } else if (lv === 2) {
      wall(g, 1, 13, 14, 10, C.stoneLight, C.stoneDark);
      r(g, 1, 13, 14, 1, C.stone);
      roof(g, 0, 7, 16, 7, C.roofRed, C.roofRedDark);
      r(g, 6, 2, 4, 6, C.stoneLight);
      r(g, 6, 1, 4, 1, C.roofRedDark);
      gable(g, 8, 8, 3, C.roofRed, C.roofRedDark);
      flag(g, 8, 0);
      door(g, 7, 18, 5);
      win(g, 3, 16);
      win(g, 11, 16);
      win(g, 7, 3);
    } else {
      wall(g, 1, 12, 14, 11, C.plaster, C.plasterDark);
      r(g, 1, 12, 14, 1, C.gold);
      roof(g, 0, 6, 16, 7, C.roofBlue, C.roofBlueDark);
      // towers
      r(g, 0, 3, 3, 10, C.stoneLight);
      r(g, 13, 3, 3, 10, C.stoneLight);
      r(g, 0, 2, 3, 1, C.roofBlueDark);
      r(g, 13, 2, 3, 1, C.roofBlueDark);
      r(g, 6, 0, 4, 7, C.plaster);
      r(g, 7, 2, 2, 2, C.gold);
      flag(g, 8, 0, C.gold);
      door(g, 7, 18, 5);
      win(g, 3, 15);
      win(g, 11, 15);
      win(g, 3, 19);
      win(g, 11, 19);
    }
  },
  dock(g, lv) {
    // pier
    r(g, 2, 14, 12, 4, C.woodLight);
    for (let x = 3; x < 14; x += 3) r(g, x, 14, 1, 4, C.wood);
    r(g, 2, 18, 12, 1, C.woodDark);
    r(g, 3, 19, 1, 3, C.woodDark);
    r(g, 12, 19, 1, 3, C.woodDark);
    // boat
    r(g, 5, 21, 8, 2, C.woodDark);
    r(g, 6, 23, 6, 1, C.woodDark);
    r(g, 8, 13, 1, 8, C.outline);
    r(g, 9, 13, 3, 6, C.white);
    if (lv >= 2) {
      wall(g, 1, 9, 6, 5, C.wood, C.woodDark);
      roof(g, 0, 6, 8, 4, C.roofBlue, C.roofBlueDark);
      r(g, 10, 12, 4, 1, C.roofRed);
    }
  },
  goldmine(g, lv) {
    // rocky mound
    r(g, 1, 14, 14, 9, C.stoneDark);
    r(g, 2, 12, 12, 2, C.stone);
    r(g, 4, 10, 8, 2, C.stone);
    r(g, 5, 15, 6, 8, '#2a2430');
    r(g, 4, 14, 1, 9, C.woodDark);
    r(g, 11, 14, 1, 9, C.woodDark);
    r(g, 4, 14, 8, 1, C.woodDark);
    r(g, 3, 11, 1, 1, C.gold);
    r(g, 12, 13, 1, 1, C.gold);
    // cart
    r(g, 11, 20, 4, 2, C.woodLight);
    r(g, 11, 19, 4, 1, C.gold);
    r(g, 11, 22, 1, 1, C.outline);
    r(g, 14, 22, 1, 1, C.outline);
    if (lv >= 2) {
      r(g, 6, 3, 1, 8, C.woodDark);
      r(g, 10, 3, 1, 8, C.woodDark);
      r(g, 6, 3, 5, 1, C.woodDark);
      r(g, 7, 4, 3, 2, C.stoneLight);
    }
  },
  temple(g, lv) {
    shadow(g, 0, B, 16);
    r(g, 1, 21, 14, 2, C.stoneLight);
    r(g, 1, 22, 14, 1, C.stoneDark);
    const cols = lv === 1 ? [3, 7, 11] : [2, 5, 8, 11, 13];
    r(g, 2, 13, 12, 8, C.plasterDark);
    for (const x of cols) {
      r(g, x, 13, 2, 8, C.white);
      r(g, x + 1, 13, 1, 8, C.plasterDark);
    }
    r(g, 1, 11, 14, 2, C.white);
    r(g, 1, 12, 14, 1, C.plasterDark);
    gable(g, 8, 5, 6, C.white, C.plasterDark);
    r(g, 7, 8, 2, 2, C.gold);
    if (lv >= 2) {
      r(g, 5, 1, 6, 4, C.gold);
      r(g, 6, 0, 4, 1, C.gold);
      r(g, 9, 1, 2, 4, C.goldDark);
    }
  },
  lighthouse() {
    /* drawn separately (taller canvas) */
  },
};

/** Draws a building at the given level into a new 16×26 canvas. */
export function drawBuilding(type: BuildingType, level: number): HTMLCanvasElement {
  if (type === 'lighthouse') return drawLighthouse();
  const [c, g] = makeCanvas(SPRITE_W, SPRITE_H);
  DRAW[type](g, level);
  return c;
}

export function drawLighthouse(): HTMLCanvasElement {
  const [c, g] = makeCanvas(16, 48);
  shadow(g, 1, 46, 14);
  r(g, 1, 40, 14, 6, C.stone);
  r(g, 1, 45, 14, 1, C.stoneDark);
  for (let y = 12; y < 40; y++) {
    const inset = Math.floor((40 - y) / 9);
    const band = Math.floor((y - 12) / 5) % 2 === 0;
    r(g, 4 + inset - 1, y, 10 - inset * 2 + 2 - 2, 1, band ? C.white : C.roofRed);
    r(g, 12 - inset - 1, y, 1, 1, band ? C.plasterDark : C.roofRedDark);
  }
  r(g, 3, 11, 10, 1, C.outline);
  r(g, 4, 6, 8, 5, C.outline);
  r(g, 5, 7, 6, 3, C.window);
  r(g, 4, 4, 8, 2, C.roofRed);
  r(g, 6, 2, 4, 2, C.roofRedDark);
  r(g, 7, 1, 2, 1, C.gold);
  r(g, 7, 35, 2, 5, C.door);
  return c;
}

export function drawScaffold(progress: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(SPRITE_W, SPRITE_H);
  r(g, 1, 21, 14, 2, C.soil);
  const h = Math.max(2, Math.round(12 * progress));
  r(g, 3, 22 - h, 10, h, C.plasterDark);
  for (const x of [2, 7, 13]) r(g, x, 9, 1, 14, C.woodDark);
  for (const y of [11, 16, 21]) r(g, 2, y, 12, 1, C.wood);
  r(g, 3, 10, 1, 1, C.woodLight);
  crate(g, 12, 20);
  return c;
}

// ---- Terrain decorations ---------------------------------------------------

export function drawTree(variant: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(8, 11);
  r(g, 1, 10, 6, 1, C.shadow);
  r(g, 3, 7, 2, 3, C.trunk);
  if (variant % 2 === 0) {
    // conifer
    for (let i = 0; i < 4; i++) r(g, 3 - i, 1 + i * 2, 2 + i * 2, 2, i % 2 ? C.leafDark : C.leaf);
    r(g, 3, 0, 2, 1, C.leafLight);
    r(g, 1, 7, 6, 1, C.leafDark);
  } else {
    // round broadleaf
    r(g, 1, 1, 6, 6, C.leaf);
    r(g, 0, 2, 8, 4, C.leaf);
    r(g, 2, 1, 3, 2, C.leafLight);
    r(g, 1, 5, 7, 2, C.leafDark);
  }
  return c;
}

export function drawPeak(variant: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(16, 14);
  const h = 10 + (variant % 3);
  const top = 13 - h;
  for (let i = 0; i < h; i++) {
    const half = Math.floor((i + 1) * 0.75) + 1;
    const y = top + i;
    r(g, 8 - half, y, half, 1, '#9d9a96');
    r(g, 8, y, half, 1, '#77736f');
    if (i < 3) {
      r(g, 8 - half, y, half, 1, '#f3f1ec');
      r(g, 8, y, half, 1, '#d4d2cd');
    }
  }
  r(g, 1, 13, 14, 1, 'rgba(20,16,30,0.25)');
  return c;
}

export function drawCactus(): HTMLCanvasElement {
  const [c, g] = makeCanvas(5, 7);
  r(g, 2, 0, 1, 7, '#4f8a43');
  r(g, 0, 2, 1, 2, '#4f8a43');
  r(g, 0, 3, 2, 1, '#4f8a43');
  r(g, 4, 1, 1, 2, '#4f8a43');
  r(g, 3, 2, 1, 1, '#4f8a43');
  return c;
}

// ---- UI icons ----------------------------------------------------------------

export type IconName = 'food' | 'wood' | 'stone' | 'gold' | 'knowledge' | 'population' | 'happiness' | 'housing' | 'workers' | 'storage';

export function drawIcon(name: IconName): HTMLCanvasElement {
  const [c, g] = makeCanvas(12, 12);
  switch (name) {
    case 'food':
      r(g, 5, 1, 2, 10, C.wheatDark);
      for (let y = 2; y < 8; y += 2) {
        r(g, 3, y, 2, 2, C.wheat);
        r(g, 7, y + 1, 2, 2, C.wheat);
      }
      r(g, 5, 0, 2, 2, C.wheat);
      break;
    case 'wood':
      r(g, 1, 4, 10, 5, C.wood);
      r(g, 1, 4, 10, 1, C.woodLight);
      r(g, 1, 8, 10, 1, C.woodDark);
      r(g, 8, 4, 3, 5, C.woodLight);
      r(g, 9, 6, 1, 1, C.woodDark);
      break;
    case 'stone':
      r(g, 2, 5, 8, 5, C.stone);
      r(g, 3, 3, 6, 2, C.stoneLight);
      r(g, 2, 9, 8, 1, C.stoneDark);
      r(g, 7, 5, 3, 4, C.stoneDark);
      break;
    case 'gold':
      r(g, 2, 2, 8, 8, C.gold);
      r(g, 3, 1, 6, 10, C.gold);
      r(g, 1, 3, 10, 6, C.gold);
      r(g, 4, 3, 4, 6, C.goldDark);
      r(g, 5, 4, 2, 4, C.gold);
      break;
    case 'knowledge':
      r(g, 1, 2, 10, 8, C.plaster);
      r(g, 1, 2, 10, 1, C.roofBlue);
      r(g, 1, 9, 10, 1, C.roofBlue);
      for (let y = 4; y < 9; y += 2) r(g, 3, y, 6, 1, C.plasterDark);
      break;
    case 'population':
      r(g, 4, 1, 4, 4, '#f0c8a0');
      r(g, 3, 5, 6, 6, C.roofBlue);
      r(g, 2, 6, 1, 4, C.roofBlue);
      r(g, 9, 6, 1, 4, C.roofBlue);
      break;
    case 'happiness':
      r(g, 2, 1, 8, 10, C.gold);
      r(g, 1, 2, 10, 8, C.gold);
      r(g, 4, 4, 1, 2, C.outline);
      r(g, 7, 4, 1, 2, C.outline);
      r(g, 3, 7, 1, 1, C.outline);
      r(g, 8, 7, 1, 1, C.outline);
      r(g, 4, 8, 4, 1, C.outline);
      break;
    case 'housing':
      r(g, 2, 6, 8, 5, C.plaster);
      for (let i = 0; i < 5; i++) r(g, 1 + i, 5 - i, 10 - i * 2, 1, C.roofRed);
      r(g, 5, 8, 2, 3, C.door);
      break;
    case 'workers':
      r(g, 2, 7, 8, 2, C.stoneDark);
      r(g, 7, 2, 2, 7, C.woodDark);
      r(g, 5, 1, 6, 3, C.stone);
      break;
    case 'storage':
      crate(g, 1, 6);
      crate(g, 5, 6);
      crate(g, 3, 3);
      r(g, 8, 6, 3, 5, C.woodLight);
      break;
  }
  return c;
}

const iconCache = new Map<string, string>();
/** Data-URL for an icon, cached (used by the HTML UI). */
export function iconUrl(name: IconName): string {
  if (!iconCache.has(name)) iconCache.set(name, drawIcon(name).toDataURL());
  return iconCache.get(name)!;
}

const buildingUrlCache = new Map<string, string>();
export function buildingIconUrl(type: BuildingType, level = 1): string {
  const key = `${type}${level}`;
  if (!buildingUrlCache.has(key)) buildingUrlCache.set(key, drawBuilding(type, level).toDataURL());
  return buildingUrlCache.get(key)!;
}
