import { describe, expect, it } from 'vitest';
import type { LocalLogEntry } from '../../data/logStore';
import { canPageForward, dayRowSummary, listWindow, pageDay, parsedQuantity, previewEntry, steppedAmount, topSources } from './diaryView';

function entry(over: Partial<LocalLogEntry> = {}): LocalLogEntry {
  return {
    id: 'a',
    name: 'Skyr',
    meal: 'lunch',
    quantity: 150,
    unit: 'g',
    grams: 150,
    kcal: 60,
    protein_g: 10,
    fat_g: 0.2,
    sat_fat_g: null,
    carbs_g: 4,
    sugars_g: null,
    fibre_g: null,
    salt_g: null,
    kcal_total: 90,
    protein_g_total: 15,
    fat_g_total: 0.3,
    sat_fat_g_total: null,
    carbs_g_total: 6,
    sugars_g_total: null,
    fibre_g_total: null,
    salt_g_total: null,
    ...over,
  } as LocalLogEntry;
}

describe('the day list', () => {
  it('shows the seven days ending today, newest first', () => {
    const days = listWindow('2026-10-17', '2026-10-17');
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-10-17');
    expect(days[6]).toBe('2026-10-11');
  });

  it('keeps the same block of seven for every day inside it', () => {
    expect(listWindow('2026-10-11', '2026-10-17')[0]).toBe('2026-10-17');
  });

  it('moves in whole blocks counted back from today', () => {
    expect(listWindow('2026-10-10', '2026-10-17')[0]).toBe('2026-10-10');
    expect(listWindow('2026-10-04', '2026-10-17')[6]).toBe('2026-10-04');
  });

  it('treats a day in the future as the current block', () => {
    expect(listWindow('2026-10-20', '2026-10-17')[0]).toBe('2026-10-17');
  });

  it('crosses a month end', () => {
    expect(listWindow('2026-11-02', '2026-11-02')[6]).toBe('2026-10-27');
  });

  it('pages a week at a time and never past today', () => {
    expect(pageDay('2026-10-17', '2026-10-17', -1)).toBe('2026-10-10');
    expect(pageDay('2026-10-10', '2026-10-17', 1)).toBe('2026-10-17');
    expect(pageDay('2026-10-14', '2026-10-17', 1)).toBe('2026-10-17');
  });

  it('offers the next page only when an older block is showing', () => {
    expect(canPageForward('2026-10-14', '2026-10-17')).toBe(false);
    expect(canPageForward('2026-10-10', '2026-10-17')).toBe(true);
  });
});

describe('a day row', () => {
  it('fills against the target of that day', () => {
    const r = dayRowSummary([entry({ kcal_total: 1200 })], 2400);
    expect(r.kcal.value).toBe(1200);
    expect(r.pct).toBe(50);
    expect(r.over).toBe(false);
  });

  it('caps the bar and marks a day above the target', () => {
    const r = dayRowSummary([entry({ kcal_total: 2600 })], 2400);
    expect(r.pct).toBe(100);
    expect(r.over).toBe(true);
  });

  it('does not mark a day exactly on the target as over', () => {
    expect(dayRowSummary([entry({ kcal_total: 2400 })], 2400).over).toBe(false);
  });

  it('keeps an unlogged day apart from a zero day', () => {
    const r = dayRowSummary([], 2400);
    expect(r.kcal.count).toBe(0);
    expect(r.kcal.value).toBeNull();
    expect(r.pct).toBe(0);
    expect(r.over).toBe(false);
  });

  it('leaves calories unknown when no entry has a value', () => {
    const r = dayRowSummary([entry({ kcal_total: null })], 2400);
    expect(r.kcal.value).toBeNull();
    expect(r.kcal.covered).toBe(0);
    expect(r.kcal.count).toBe(1);
    expect(r.pct).toBe(0);
  });

  it('has no fill without a goal', () => {
    const r = dayRowSummary([entry({ kcal_total: 500 })], null);
    expect(r.pct).toBe(0);
    expect(r.over).toBe(false);
  });
});

describe('the amount stepper', () => {
  it('moves grams and millilitres by 10', () => {
    expect(steppedAmount(180, 'g', 1)).toBe(190);
    expect(steppedAmount(180, 'ml', -1)).toBe(170);
  });

  it('moves servings and pieces by 1', () => {
    expect(steppedAmount(2, 'serving', 1)).toBe(3);
    expect(steppedAmount(2, 'piece', -1)).toBe(1);
  });

  it('stops at the smallest step', () => {
    expect(steppedAmount(10, 'g', -1)).toBe(10);
    expect(steppedAmount(5, 'g', -1)).toBe(5);
    expect(steppedAmount(1, 'piece', -1)).toBe(1);
  });

  it('does not let binary fractions pile up', () => {
    expect(steppedAmount(180.1, 'g', 1)).toBe(190.1);
  });
});

describe('a typed amount', () => {
  it('reads a decimal comma', () => {
    expect(parsedQuantity('12,5')).toBe(12.5);
  });

  it('is null when empty or not a number', () => {
    expect(parsedQuantity('')).toBeNull();
    expect(parsedQuantity('abc')).toBeNull();
  });
});

describe('the live preview of an edit', () => {
  it('rescales the totals through the per-100 values', () => {
    const p = previewEntry(entry(), { quantity: 300, meal: 'lunch' });
    expect(p.quantity).toBe(300);
    expect(p.grams).toBe(300);
    expect(p.kcal_total).toBe(180);
    expect(p.protein_g_total).toBe(30);
  });

  it('keeps grams per unit for a serving', () => {
    const p = previewEntry(entry({ quantity: 2, unit: 'serving', grams: 80 }), { quantity: 3, meal: 'lunch' });
    expect(p.grams).toBe(120);
    expect(p.kcal_total).toBe(72);
  });

  it('keeps an unknown nutrient unknown', () => {
    const p = previewEntry(entry(), { quantity: 300, meal: 'lunch' });
    expect(p.fibre_g_total).toBeNull();
  });

  it('moves the entry to the chosen meal', () => {
    expect(previewEntry(entry(), { quantity: 150, meal: 'dinner' }).meal).toBe('dinner');
  });

  it('leaves the numbers alone while the amount cannot be read', () => {
    const p = previewEntry(entry(), { quantity: null, meal: 'dinner' });
    expect(p.kcal_total).toBe(90);
    expect(p.meal).toBe('dinner');
  });

  it('leaves the numbers alone when a serving has no amount to rescale from', () => {
    const p = previewEntry(entry({ quantity: 0, unit: 'serving', grams: 0, kcal_total: 0 }), { quantity: 2, meal: 'lunch' });
    expect(p.grams).toBe(0);
    expect(p.kcal_total).toBe(0);
  });
});

describe('top sources', () => {
  const rows = [
    entry({ id: 'a', name: 'Skyr', protein_g_total: 15 }),
    entry({ id: 'b', name: 'Chicken', protein_g_total: 60 }),
    entry({ id: 'c', name: 'Rice', protein_g_total: 3 }),
    entry({ id: 'd', name: 'Egg', protein_g_total: 12 }),
    entry({ id: 'e', name: 'Oil', protein_g_total: 0 }),
    entry({ id: 'f', name: 'Unknown', protein_g_total: null }),
  ];

  it('takes the three largest, largest first', () => {
    expect(topSources(rows, 'protein_g').map((s) => s.name)).toEqual(['Chicken', 'Skyr', 'Egg']);
  });

  it('scales to the largest with a visible minimum', () => {
    const s = topSources(rows, 'protein_g');
    expect(s[0].pct).toBe(100);
    expect(s[1].pct).toBe(25);
    expect(topSources([entry({ protein_g_total: 100 }), entry({ id: 'x', protein_g_total: 1 })], 'protein_g')[1].pct).toBe(6);
  });

  it('skips unknown and zero values rather than ranking them', () => {
    expect(topSources([entry({ protein_g_total: null }), entry({ id: 'y', protein_g_total: 0 })], 'protein_g')).toEqual([]);
  });
});
