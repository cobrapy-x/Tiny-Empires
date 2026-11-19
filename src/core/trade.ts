import { TRADE } from '../config/balance';
import { countType, type CheckResult } from './buildingSystem';
import { computeEconomy, techEffects } from './economy';
import type { GameState, World } from './types';

export type Tradable = keyof typeof TRADE.value;
export const TRADABLES: Tradable[] = ['food', 'wood', 'stone'];

function marketCount(state: GameState): number {
  return state.buildings.filter((b) => b.type === 'market' && (b.construction === 0 || b.upgradeTo > 0)).length;
}

/** Gold received for selling one lot. */
export function sellPrice(state: GameState, res: Tradable): number {
  const bonus = Math.min(0.25, 0.05 * (marketCount(state) - 1)) + techEffects(state).tradeBonus;
  return Math.floor(TRADE.lot * TRADE.value[res] * TRADE.sellFactor * (1 + bonus));
}

/** Gold paid for buying one lot. Always strictly above the sell price. */
export function buyPrice(state: GameState, res: Tradable): number {
  const bonus = Math.min(0.25, 0.05 * (marketCount(state) - 1)) + techEffects(state).tradeBonus;
  const price = Math.ceil(TRADE.lot * TRADE.value[res] * TRADE.buyFactor * (1 - bonus * 0.5));
  return Math.max(price, sellPrice(state, res) + 1);
}

export function canTrade(state: GameState, world: World, res: Tradable, side: 'buy' | 'sell'): CheckResult {
  if (countType(state, 'market', false) === 0 || marketCount(state) === 0) return { ok: false, reason: 'Build a Market to trade.' };
  if (side === 'sell') {
    if (state.resources[res] < TRADE.lot) return { ok: false, reason: `Need ${TRADE.lot} ${res}.` };
    return { ok: true };
  }
  if (state.resources.gold < buyPrice(state, res)) return { ok: false, reason: 'Not enough gold.' };
  if (state.resources[res] + TRADE.lot > computeEconomy(state, world).storage) return { ok: false, reason: 'Storage is full.' };
  return { ok: true };
}

export function trade(state: GameState, world: World, res: Tradable, side: 'buy' | 'sell'): CheckResult {
  const check = canTrade(state, world, res, side);
  if (!check.ok) return check;
  if (side === 'sell') {
    state.resources[res] -= TRADE.lot;
    state.resources.gold += sellPrice(state, res);
  } else {
    state.resources.gold -= buyPrice(state, res);
    state.resources[res] += TRADE.lot;
  }
  state.stats.trades++;
  return { ok: true };
}
