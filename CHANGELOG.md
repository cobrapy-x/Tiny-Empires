# Changelog

All notable changes to Tiny Empires are documented here.

## [Unreleased]

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
