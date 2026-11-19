export interface EraRequirement {
  population?: number;
  techs?: number;
  buildings?: number;
  townhallLevel?: number;
  lighthouse?: boolean;
}

export interface EraDef {
  id: number;
  name: string;
  /** Requirements to ADVANCE INTO this era. */
  requires: EraRequirement;
  reward: string;
}

export const ERAS: EraDef[] = [
  { id: 1, name: 'Hamlet', requires: {}, reward: '' },
  { id: 2, name: 'Village', requires: { population: 15, techs: 2, buildings: 8 }, reward: 'Tier 2 research and Town Hall Lv2 unlocked.' },
  { id: 3, name: 'Town', requires: { population: 35, techs: 5, townhallLevel: 2 }, reward: 'Tier 3 research and Town Hall Lv3 unlocked.' },
  { id: 4, name: 'City', requires: { population: 65, techs: 9, townhallLevel: 3 }, reward: 'Tier 4 research — the Grand Lighthouse awaits.' },
  { id: 5, name: 'Empire', requires: { lighthouse: true }, reward: 'Your island empire is complete!' },
];

export const MAX_ERA = ERAS.length;
