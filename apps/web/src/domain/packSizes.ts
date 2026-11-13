// Pack sizes as portion choices (packages/contracts/nutrition/pack_sizes.json).
// Only plain sizes in the food's own unit family are offered; anything else is left out, never guessed.

export interface PackAmount {
  /** The whole pack in the food's own unit (g or ml). */
  amount: number;
  /** The size as the label shows it. */
  label: string;
}

const MAX_PACKS = 6;
const SIZE = /^(\d+(?:[.,]\d+)?)\s*(kg|g|l|dl|cl|ml)$/i;
const FACTOR: Record<string, { family: 'g' | 'ml'; times: number }> = {
  kg: { family: 'g', times: 1000 },
  g: { family: 'g', times: 1 },
  l: { family: 'ml', times: 1000 },
  dl: { family: 'ml', times: 100 },
  cl: { family: 'ml', times: 10 },
  ml: { family: 'ml', times: 1 },
};

export function packAmounts(packSize: string | null, unit: 'g' | 'ml' | 'portion'): PackAmount[] {
  if (!packSize || unit === 'portion') return [];
  const out: PackAmount[] = [];
  for (const part of packSize.split(/,\s+/)) {
    const m = SIZE.exec(part.trim());
    if (!m) continue;
    const f = FACTOR[m[2].toLowerCase()];
    if (f.family !== unit) continue;
    const amount = Math.round(Number(m[1].replace(',', '.')) * f.times * 100) / 100;
    if (amount > 0 && !out.some((p) => p.amount === amount)) out.push({ amount, label: part.trim() });
  }
  return out.sort((a, b) => a.amount - b.amount).slice(0, MAX_PACKS);
}
