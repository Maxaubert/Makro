import { describe, expect, it } from 'vitest';
import { roundForDisplay } from './display';
import { loadGolden } from './golden';

type DisplayInput = { value: number; rounding: { digits: number; mode: string } };
const golden = loadGolden<DisplayInput, number>('nutrition/display.json');

describe('nutrition/display.json', () => {
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(c.input.rounding.mode).toBe('half-away-from-zero');
    // Rounded values must match exactly, not within a tolerance.
    expect(roundForDisplay(c.input.value, c.input.rounding.digits)).toBe(c.expected);
  });

  it('keeps unknown as unknown', () => {
    expect(roundForDisplay(null, 0)).toBeNull();
  });

  it('never shows negative zero', () => {
    expect(Object.is(roundForDisplay(-0.2, 0), -0)).toBe(false);
  });
});
