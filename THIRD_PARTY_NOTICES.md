# Third-party notices

## Runtime dependency (shipped in the game bundle)

| Package | Version | Licence | Use |
|---|---|---|---|
| [Phaser](https://github.com/phaserjs/phaser) | 3.90.0 | MIT | 2D rendering, input, tweens, scene loop |

Phaser is Copyright (c) 2013–2025 Phaser Studio Inc. and is distributed under the MIT licence; its full licence text is included in `node_modules/phaser/LICENSE.md` after `npm install`.

## Development-only dependencies (not shipped)

| Package | Licence | Use |
|---|---|---|
| TypeScript | Apache-2.0 | Type checking |
| Vite | MIT | Dev server and production bundler |
| Vitest | MIT | Unit tests |
| Playwright (Python, optional) | Apache-2.0 | Browser smoke test in `scripts/smoke_test.py` |

## Art, audio and fonts

No third-party art, audio or font files are used.

- **Pixel art** (terrain, buildings, icons, effects) is drawn at runtime by code in `src/render/sprites.ts` and `src/render/terrainRenderer.ts`.
- **Music and sound effects** are synthesised at runtime with the Web Audio API in `src/audio/AudioEngine.ts`.
- **Text** uses the player's system UI font stack.
- **Event icons** are Unicode emoji, rendered by the player's operating system font.
