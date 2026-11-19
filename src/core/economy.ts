import { FOOD_PER_POP, HAPPINESS, TAX_LEVELS, happinessMultiplier } from '../config/balance';
import { BUILDINGS } from '../config/buildings';
import { TECH_BY_ID, type TechEffects } from '../config/techs';
import { isActive, levelDef, siteMultiplier } from './buildingSystem';
import { RESOURCE_KEYS, type GameState, type ModifierKind, type ResourceKey, type Resources, type World } from './types';

export interface Line {
  label: string;
  value: number;
}

export interface EconomyReport {
  housing: number;
  jobs: number;
  employed: number;
  workforce: number;
  storage: number;
  production: Resources;
  consumption: Resources;
  net: Resources;
  breakdown: Record<ResourceKey, Line[]>;
  happinessTarget: number;
  happinessFactors: Line[];
  productionMultiplier: number;
}

const zero = (): Resources => ({ food: 0, wood: 0, stone: 0, gold: 0, knowledge: 0 });

export function modifierProduct(state: GameState, kind: ModifierKind): number {
  return state.modifiers.filter((m) => m.kind === kind).reduce((p, m) => p * m.value, 1);
}

export function modifierSum(state: GameState, kind: ModifierKind): number {
  return state.modifiers.filter((m) => m.kind === kind).reduce((s, m) => s + m.value, 0);
}

/** Aggregate effects of all researched technologies. */
export function techEffects(state: GameState): Required<Omit<TechEffects, 'production'>> & { production: Record<string, number> } {
  const out = { production: {} as Record<string, number>, happiness: 0, growth: 0, taxBonus: 0, tradeBonus: 0, desertFarms: false };
  for (const id of state.researched) {
    const e = TECH_BY_ID[id]?.effects;
    if (!e) continue;
    for (const [k, v] of Object.entries(e.production ?? {})) out.production[k] = (out.production[k] ?? 0) + (v ?? 0);
    out.happiness += e.happiness ?? 0;
    out.growth += e.growth ?? 0;
    out.taxBonus += e.taxBonus ?? 0;
    out.tradeBonus += e.tradeBonus ?? 0;
    out.desertFarms ||= !!e.desertFarms;
  }
  return out;
}

/**
 * Pure function: computes this tick's production, consumption, capacity and
 * happiness target. The UI uses the same report for tooltips so numbers match.
 */
export function computeEconomy(state: GameState, world: World): EconomyReport {
  const production = zero();
  const consumption = zero();
  const breakdown = { food: [], wood: [], stone: [], gold: [], knowledge: [] } as Record<ResourceKey, Line[]>;
  const tech = techEffects(state);
  let housing = 0;
  let jobs = 0;
  let storage = 0;
  const happinessSources: number[] = [];

  const active = state.buildings.filter(isActive);
  for (const b of active) {
    const def = levelDef(b.type, b.level);
    housing += def.housing ?? 0;
    jobs += def.workers ?? 0;
    storage += def.storage ?? 0;
    if (def.happiness) happinessSources.push(def.happiness);
  }
  const pop = state.population;
  const employed = Math.min(pop, jobs);
  const workforce = jobs > 0 ? employed / jobs : 1;
  const happyMul = happinessMultiplier(state.happiness);
  const gold = state.resources.gold;

  const resMul = (k: ResourceKey): number => {
    let m = 1 + (tech.production[k] ?? 0) + (tech.production.all ?? 0);
    if (k === 'food') m *= modifierProduct(state, 'foodMul');
    if (k === 'wood' || k === 'stone') m *= modifierProduct(state, 'woodStoneMul');
    if (k === 'gold') m *= modifierProduct(state, 'goldMul');
    if (k === 'knowledge') m *= modifierProduct(state, 'knowledgeMul');
    return m * modifierProduct(state, 'allMul');
  };
  const mul = Object.fromEntries(RESOURCE_KEYS.map((k) => [k, resMul(k)])) as Resources;

  const byType = new Map<string, { count: number; res: Resources }>();
  for (const b of active) {
    const def = levelDef(b.type, b.level);
    const hasUpkeep = !!def.upkeep && Object.keys(def.upkeep).length > 0;
    const funded = !hasUpkeep || gold > 0.01;
    const eff = (def.workers ? workforce : 1) * (funded ? 1 : 0) * siteMultiplier(state, world, b) * happyMul;
    const entry = byType.get(b.type) ?? { count: 0, res: zero() };
    entry.count++;
    for (const [k, v] of Object.entries(def.produces ?? {}) as [ResourceKey, number][]) {
      const amount = v * eff * mul[k];
      production[k] += amount;
      entry.res[k] += amount;
    }
    if (funded) for (const [k, v] of Object.entries(def.upkeep ?? {}) as [ResourceKey, number][]) consumption[k] += v;
    byType.set(b.type, entry);
  }
  for (const [type, { count, res }] of byType) {
    for (const k of RESOURCE_KEYS) {
      if (res[k] > 0) breakdown[k].push({ label: `${BUILDINGS[type as keyof typeof BUILDINGS].name}${count > 1 ? ` ×${count}` : ''}`, value: res[k] });
    }
  }

  // Taxes
  const tax = pop * TAX_LEVELS[state.taxRate].goldPerPop * (1 + tech.taxBonus) * mul.gold;
  production.gold += tax;
  breakdown.gold.push({ label: `Taxes (${TAX_LEVELS[state.taxRate].label})`, value: tax });

  // Consumption
  const eat = pop * FOOD_PER_POP * modifierProduct(state, 'consumptionMul');
  consumption.food += eat;
  breakdown.food.push({ label: `Population eats`, value: -eat });
  if (consumption.gold > 0) breakdown.gold.push({ label: 'Building upkeep', value: -consumption.gold });

  const net = zero();
  for (const k of RESOURCE_KEYS) net[k] = production[k] - consumption[k];

  // Happiness target
  const factors: Line[] = [{ label: 'Base', value: HAPPINESS.base }];
  const taxH = TAX_LEVELS[state.taxRate].happiness;
  if (taxH) factors.push({ label: `${TAX_LEVELS[state.taxRate].label} taxes`, value: taxH });
  happinessSources.sort((a, b) => b - a);
  const bHappy = happinessSources.reduce((s, h, i) => s + h * Math.pow(0.8, i), 0);
  if (bHappy) factors.push({ label: 'Markets, temples & monuments', value: Math.round(bHappy * 10) / 10 });
  if (tech.happiness) factors.push({ label: 'Medicine', value: tech.happiness });
  if (state.resources.food <= 0.01 && net.food < 0) factors.push({ label: 'Starvation!', value: HAPPINESS.starving });
  else if (net.food >= 0) factors.push({ label: 'Well fed', value: HAPPINESS.wellFed });
  if (pop > housing) factors.push({ label: 'Overcrowding', value: -Math.min(HAPPINESS.overcrowdMax, (pop - housing) * HAPPINESS.overcrowdPerPerson) });
  const unemployed = pop - employed;
  if (unemployed > 2 && pop > 0) factors.push({ label: 'Unemployment', value: Math.round(HAPPINESS.unemploymentMax * Math.min(1, unemployed / pop) * 10) / 10 });
  const stress = Math.floor(pop / HAPPINESS.stressPerPop);
  if (stress > 0) factors.push({ label: 'Crowded city life', value: -stress });
  for (const m of state.modifiers) if (m.kind === 'happiness') factors.push({ label: m.label, value: m.value });
  const target = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.value, 0)));

  return {
    housing,
    jobs,
    employed,
    workforce,
    storage,
    production,
    consumption,
    net,
    breakdown,
    happinessTarget: target,
    happinessFactors: factors,
    productionMultiplier: happyMul,
  };
}
