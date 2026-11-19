# Changelog

All notable changes to Tiny Empires are documented here.

## [1.0.0] — 2026-11-19

### Milestone 5 — Release
- README with installation, gameplay, architecture, save format, deployment, test procedure, results, known issues and future work.
- GitHub Pages workflow (`.github/workflows/deploy.yml`), Cloudflare Pages `_headers`, offline service worker and web manifest.
- MIT licence and third-party notices (all art and audio generated at runtime).
- Browser smoke test (`scripts/smoke_test.py`) covering five viewport sizes.
- Verified: 62/62 unit tests, strict type check, production build, smoke test with no console errors.

### Milestone 4 — Polish
- Animated feedback: building pop-in/upgrade squash, construction scaffolds with progress bars, dust puffs, floating "+X wood" production numbers, chimney smoke, drifting cloud shadows, water sparkles.
- Day/night cycle with glowing windows and a shining lighthouse lamp.
- Synthesised audio (Web Audio): generative pentatonic soundtrack and 11 sound effects, with separate music / SFX volume.
- 7-step interactive tutorial with highlighted UI, skippable and replayable.
- Responsive layout for desktop, tablet, phone portrait and phone landscape; bottom-sheet info panel on phones; long-press tooltips on touch.
- Early warnings for food/gold shortages, unhappiness and full housing.
- Readability fixes (cost icons in build cards, primary choice contrast), `[hidden]` handling, settings for UI scale and reduced motion.

### Milestones 1–3 — Foundation, civilization systems, gameplay depth
- Vite + TypeScript + Phaser 3 project scaffold.
- Seeded procedural island generation (grassland, forest, mountains, desert, rivers, beaches, gold veins) with fair, deadlock-free start locations.
- Pixel-art terrain renderer with noise-jittered biome transitions, water depth shading, shoreline foam, trees, peaks and cacti.
- Camera pan (drag / WASD / arrows), zoom toward pointer (wheel / pinch / Q E), tile hover and selection.
- Resource economy: food, wood, stone, gold, knowledge, population and happiness with production, consumption, upkeep and storage caps.
- 12 building types (Town Hall, House, Farm, Lumber Mill, Quarry, Market, School, Warehouse, Fishing Dock, Gold Mine, Temple, Grand Lighthouse) with construction time, upgrades, site bonuses, territory and 50% demolition refunds.
- Population simulation: housing, jobs/workforce efficiency, growth, starvation, emigration; happiness from taxes, buildings, food, overcrowding, unemployment and city stress.
- 15-technology research tree across four tiers, five eras with clear goals, Grand Lighthouse victory.
- 13 dynamic events with meaningful choices (harvests, droughts, caravans, settlers, booms, shortages, breakthroughs, plague...).
- 19 achievements, per-island and lifetime statistics.
- Market trading with a buy/sell spread and tax policy.
- Autosave, three manual save slots, export/import, versioned & validated save format.
- HTML/CSS interface: resource bar with breakdown tooltips, build bar, info panel, research tree, economy, goals, records, menus.
- Automated tests: world generation, economy, buildings, research, events, save/load, balance bot, deadlock and exploit checks.
