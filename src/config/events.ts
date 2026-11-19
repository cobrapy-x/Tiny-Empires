/**
 * Dynamic events. Each event offers choices with real trade-offs. Effects are
 * deterministic: any randomness is rolled with the game's seeded RNG and stored
 * in `data` when the event fires.
 */
import { countType, isActive } from '../core/buildingSystem';
import { computeEconomy } from '../core/economy';
import type { Cost, GameState, ModifierKind, World } from '../core/types';
import { TECH_BY_ID } from './techs';

export type EventData = Record<string, number>;

export interface EventChoice {
  label: string;
  /** Short description of the consequences shown on the button. */
  detail: (s: GameState, d: EventData) => string;
  cost?: (s: GameState, d: EventData) => Cost;
  /** Extra availability check (beyond affordability). Return a reason string to disable. */
  blocked?: (s: GameState, d: EventData, w: World) => string | null;
  apply: (s: GameState, d: EventData, w: World, roll: number) => string;
}

export interface EventDef {
  id: string;
  title: string;
  icon: string;
  weight: (s: GameState) => number;
  roll?: (s: GameState, w: World, r: () => number) => EventData;
  text: (s: GameState, d: EventData) => string;
  choices: EventChoice[];
}

const RES_NAMES = ['food', 'wood', 'stone'] as const;

export function addModifier(s: GameState, kind: ModifierKind, value: number, duration: number, label: string): void {
  s.modifiers.push({ kind, value, remaining: duration, label });
}

const built = (s: GameState, type: Parameters<typeof countType>[1]): number =>
  s.buildings.filter((b) => b.type === type && isActive(b)).length;

export const EVENTS: EventDef[] = [
  {
    id: 'harvest',
    title: 'Bountiful Harvest',
    icon: '🌾',
    weight: (s) => (built(s, 'farm') >= 1 ? 3 : 0),
    roll: (s, w) => ({ bonus: Math.round(Math.max(40, Math.min(220, computeEconomy(s, w).production.food * 45))) }),
    text: (_s, d) => `The fields are overflowing — about ${d.bonus} extra food is ready to bring in. How should it be used?`,
    choices: [
      { label: 'Harvest festival', detail: () => '+12 happiness for 2 minutes', apply: (s) => (addModifier(s, 'happiness', 12, 120, 'Harvest festival'), 'The village dances until dawn.') },
      { label: 'Fill the granaries', detail: (_s, d) => `+${d.bonus} food (storage permitting)`, apply: (s, d) => ((s.resources.food += d.bonus), 'The granaries are full.') },
      { label: 'Sell to merchants', detail: (_s, d) => `+${Math.round(d.bonus * 0.6)} gold`, apply: (s, d) => ((s.resources.gold += Math.round(d.bonus * 0.6)), 'Merchants pay in shiny coin.') },
    ],
  },
  {
    id: 'drought',
    title: 'Drought',
    icon: '☀️',
    weight: (s) => (built(s, 'farm') >= 2 ? 2 : 0),
    text: () => 'The rivers are running low. Without action, farms will produce 40% less for 90 seconds.',
    choices: [
      { label: 'Dig wells', detail: () => 'Avoid the drought entirely', cost: () => ({ wood: 40, stone: 25 }), apply: () => 'Fresh water flows from the new wells.' },
      {
        label: 'Ration food',
        detail: () => 'Eat 30% less for 90s, but −8 happiness and no growth',
        apply: (s) => {
          addModifier(s, 'consumptionMul', 0.7, 90, 'Rationing');
          addModifier(s, 'happiness', -8, 90, 'Rationing');
          addModifier(s, 'growthMul', 0, 90, 'Rationing');
          return 'Belts are tightened across the land.';
        },
      },
      { label: 'Endure it', detail: () => 'Food production −40% for 90s', apply: (s) => (addModifier(s, 'foodMul', 0.6, 90, 'Drought'), 'The fields turn brown…') },
    ],
  },
  {
    id: 'caravan',
    title: 'Trade Caravan',
    icon: '🐫',
    weight: (s) => (s.tick > 200 ? 2.5 + (s.researched.includes('navigation') ? 1.5 : 0) : 0),
    roll: (s, _w, r) => {
      const res = Math.floor(r() * 3);
      const amount = 30 + Math.floor(r() * 4) * 15 + s.era * 10;
      const buying = r() < 0.5 ? 1 : 0;
      // Caravans pay/charge fairer prices than the market.
      const gold = Math.round(amount * [0.9, 1.1, 1.5][res] * (buying ? 0.95 : 1.1));
      return { res, amount, buying, gold };
    },
    text: (_s, d) =>
      d.buying
        ? `A caravan wants to buy ${d.amount} ${RES_NAMES[d.res]} for ${d.gold} gold — a better price than any market.`
        : `A caravan offers ${d.amount} ${RES_NAMES[d.res]} for ${d.gold} gold.`,
    choices: [
      {
        label: 'Accept the deal',
        detail: (_s, d) => (d.buying ? `−${d.amount} ${RES_NAMES[d.res]}, +${d.gold} gold` : `−${d.gold} gold, +${d.amount} ${RES_NAMES[d.res]}`),
        cost: (_s, d) => (d.buying ? { [RES_NAMES[d.res]]: d.amount } : { gold: d.gold }),
        apply: (s, d) => {
          if (d.buying) s.resources.gold += d.gold;
          else s.resources[RES_NAMES[d.res]] += d.amount;
          s.stats.trades++;
          return 'A handshake seals the deal.';
        },
      },
      {
        label: 'Haggle',
        detail: () => '50% chance of a 30% better deal; otherwise they leave',
        cost: (_s, d) => (d.buying ? { [RES_NAMES[d.res]]: d.amount } : { gold: Math.round(d.gold * 0.7) }),
        apply: (s, d, _w, roll) => {
          if (roll < 0.5) {
            if (d.buying) {
              s.resources[RES_NAMES[d.res]] += d.amount; // refund: they walked away
              return 'The merchants are insulted and leave.';
            }
            s.resources.gold += Math.round(d.gold * 0.7);
            return 'The merchants are insulted and leave.';
          }
          if (d.buying) s.resources.gold += Math.round(d.gold * 1.3);
          else s.resources[RES_NAMES[d.res]] += d.amount;
          s.stats.trades++;
          return 'Your silver tongue wins a fine bargain!';
        },
      },
      { label: 'Decline', detail: () => 'Nothing happens', apply: () => 'The caravan moves on.' },
    ],
  },
  {
    id: 'migrants',
    title: 'Settlers Arrive',
    icon: '🧳',
    weight: (s) => (s.population >= 8 ? 2.5 : 0),
    roll: (_s, _w, r) => ({ count: 3 + Math.floor(r() * 4) }),
    text: (_s, d) => `${d.count} families have crossed the sea and ask to join your people.`,
    choices: [
      { label: 'Welcome everyone', detail: (_s, d) => `+${d.count} population (may cause overcrowding)`, apply: (s, d) => ((s.population += d.count), 'Your settlement grows!') },
      {
        label: 'Only those we can house',
        detail: () => 'Fill free housing only',
        apply: (s, d, w) => {
          const free = Math.max(0, computeEconomy(s, w).housing - s.population);
          const n = Math.min(free, d.count);
          s.population += n;
          return n > 0 ? `${n} settlers move into empty homes.` : 'There was no room — they sail on.';
        },
      },
      { label: 'Turn them away', detail: () => '−4 happiness for 1 minute', apply: (s) => (addModifier(s, 'happiness', -4, 60, 'Turned away settlers'), 'They sail on, disappointed.') },
    ],
  },
  {
    id: 'boom',
    title: 'Population Boom',
    icon: '👶',
    weight: (s) => (s.happiness >= 62 && s.population >= 10 ? 2 : 0),
    text: () => 'Good times have led to a wave of new families. Encourage it?',
    choices: [
      {
        label: 'Build nurseries',
        detail: () => 'Growth ×2.5 for 2 minutes',
        cost: () => ({ wood: 30, food: 30 }),
        apply: (s) => (addModifier(s, 'growthMul', 2.5, 120, 'Population boom'), 'Cradles everywhere!'),
      },
      { label: 'Celebrate modestly', detail: () => '+5 happiness for 1 minute', apply: (s) => (addModifier(s, 'happiness', 5, 60, 'Celebration'), 'A quiet celebration warms hearts.') },
    ],
  },
  {
    id: 'termites',
    title: 'Termites!',
    icon: '🐜',
    weight: (s) => (s.resources.wood >= 60 ? 1.5 : 0),
    text: (s) => `Termites are eating the wood stockpile. ${Math.floor(s.resources.wood * 0.35)} wood is at risk.`,
    choices: [
      { label: 'Hire exterminators', detail: () => 'Save the wood', cost: () => ({ gold: 25 }), apply: () => 'The pests are gone.' },
      { label: 'Burn the infested wood', detail: (s) => `Lose ${Math.floor(s.resources.wood * 0.35)} wood`, apply: (s) => ((s.resources.wood *= 0.65), 'Smoke rises over the stockpile.') },
    ],
  },
  {
    id: 'tools',
    title: 'Worn-out Tools',
    icon: '🪓',
    weight: (s) => (built(s, 'lumbermill') + built(s, 'quarry') >= 2 ? 1.5 : 0),
    text: () => 'Axes are dull and picks are chipped across your mills and quarries.',
    choices: [
      { label: 'Buy new tools', detail: () => 'Keep working at full speed', cost: () => ({ gold: 35 }), apply: () => 'Shiny new tools arrive.' },
      { label: 'Make do', detail: () => 'Wood & stone −40% for 90s', apply: (s) => (addModifier(s, 'woodStoneMul', 0.6, 90, 'Worn tools'), 'Work slows to a crawl.') },
    ],
  },
  {
    id: 'scholar',
    title: 'Wandering Scholar',
    icon: '📚',
    weight: (s) => (built(s, 'school') >= 1 || s.tick > 600 ? 2 : 0),
    text: () => 'A brilliant scholar visits your town and offers her services.',
    choices: [
      {
        label: 'Fund her research',
        detail: (s) => (s.research ? 'Finish 60% of current research instantly' : '+60 knowledge'),
        cost: () => ({ gold: 40 }),
        apply: (s) => {
          if (s.research) {
            s.research.remaining = Math.max(1, Math.round(s.research.remaining - s.research.total * 0.6));
            return 'Her insight speeds up your research!';
          }
          s.resources.knowledge += 60;
          return 'She fills your library with notes.';
        },
      },
      { label: 'Give her a teaching post', detail: () => 'Knowledge ×1.6 for 2 minutes', cost: () => ({ food: 25 }), apply: (s) => (addModifier(s, 'knowledgeMul', 1.6, 120, 'Visiting scholar'), 'Students flock to her lectures.') },
      { label: 'Decline', detail: () => 'Nothing happens', apply: () => 'She continues her journey.' },
    ],
  },
  {
    id: 'eureka',
    title: 'Technological Breakthrough',
    icon: '💡',
    weight: (s) => (s.research ? 1.5 : 0),
    text: (s) => `Your researchers have a breakthrough idea for ${s.research ? TECH_BY_ID[s.research.id].name : 'their work'}!`,
    choices: [
      {
        label: 'Work through the night',
        detail: () => 'Research +50% progress, −6 happiness for 1 min',
        apply: (s) => {
          if (s.research) s.research.remaining = Math.max(1, Math.round(s.research.remaining - s.research.total * 0.5));
          addModifier(s, 'happiness', -6, 60, 'Overworked researchers');
          return 'Candles burn late into the night.';
        },
      },
      { label: 'Share it widely', detail: () => '+35 knowledge', apply: (s) => ((s.resources.knowledge += 35), 'Ideas spread through the town.') },
    ],
  },
  {
    id: 'festival',
    title: 'Call for a Festival',
    icon: '🎉',
    weight: (s) => (s.happiness < 58 && s.population >= 10 ? 2 : 0),
    text: () => 'The people are restless and ask for a grand festival.',
    choices: [
      { label: 'Throw a festival', detail: () => '+15 happiness for 2.5 minutes', cost: () => ({ gold: 40, food: 20 }), apply: (s) => (addModifier(s, 'happiness', 15, 150, 'Grand festival'), 'Music fills the streets!') },
      { label: 'Refuse', detail: () => '−6 happiness for 90s', apply: (s) => (addModifier(s, 'happiness', -6, 90, 'Festival refused'), 'Grumbling echoes in the square.') },
    ],
  },
  {
    id: 'goldvein',
    title: 'Glittering Find',
    icon: '✨',
    weight: (s) => (built(s, 'quarry') >= 1 ? 1.5 : 0),
    text: () => 'Quarry workers found a vein of gold in the rock face.',
    choices: [
      { label: 'Dig it out', detail: () => '+90 gold', cost: () => ({ wood: 25 }), apply: (s) => ((s.resources.gold += 90), 'Gold nuggets fill the carts.') },
      { label: 'Sell the claim', detail: () => '+40 gold', apply: (s) => ((s.resources.gold += 40), 'A prospector buys the claim.') },
    ],
  },
  {
    id: 'plague',
    title: 'Sickness Spreads',
    icon: '🤒',
    weight: (s) => (s.era >= 3 && s.population >= 30 ? (s.researched.includes('medicine') ? 0.3 : 1.2) : 0),
    text: () => 'A fever is spreading through the crowded streets.',
    choices: [
      { label: 'Hire healers', detail: () => 'Stop it quickly', cost: () => ({ gold: 60 }), apply: () => 'The healers contain the fever.' },
      { label: 'Quarantine', detail: () => 'All production −25% for 90s', apply: (s) => (addModifier(s, 'allMul', 0.75, 90, 'Quarantine'), 'Streets fall quiet.') },
      {
        label: 'Do nothing',
        detail: (s) => `Lose ${Math.max(1, Math.floor(s.population * 0.1))} people, −10 happiness for 2 min`,
        apply: (s) => {
          s.population = Math.max(1, s.population - Math.max(1, Math.floor(s.population * 0.1)));
          addModifier(s, 'happiness', -10, 120, 'Mourning');
          return 'The fever takes its toll.';
        },
      },
    ],
  },
  {
    id: 'wildfire',
    title: 'Forest Fire',
    icon: '🔥',
    weight: (s) => (built(s, 'lumbermill') >= 1 && s.tick > 300 ? 1 : 0),
    text: () => 'Lightning has set a forest ablaze near your lumber mills!',
    choices: [
      { label: 'Fight the fire', detail: () => 'Wood & stone −50% for 60s (workers busy)', apply: (s) => (addModifier(s, 'woodStoneMul', 0.5, 60, 'Firefighting'), 'Bucket chains save the forest.') },
      {
        label: 'Let it burn out',
        detail: (s) => `Lose ${Math.floor(Math.min(s.resources.wood, 50))} wood, −5 happiness`,
        apply: (s) => {
          s.resources.wood = Math.max(0, s.resources.wood - 50);
          addModifier(s, 'happiness', -5, 60, 'Smoke and ash');
          return 'Ash drifts over the island.';
        },
      },
    ],
  },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
