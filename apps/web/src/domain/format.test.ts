import { describe, expect, it } from 'vitest';
import { formatNumber, formatTotal } from './format';

describe('formatNumber', () => {
  it('rounds with the display rule and groups thousands', () => {
    expect(formatNumber(1559.5, 0)).toBe('1,560');
    expect(formatNumber(0.25, 1)).toBe('0.3');
    expect(formatNumber(4, 1)).toBe('4');
  });
  it('shows unknown as ?, never 0', () => {
    expect(formatNumber(null, 0)).toBe('?');
    expect(formatNumber(undefined, 1)).toBe('?');
  });
});

describe('formatTotal', () => {
  it('says how many entries had no value', () => {
    expect(formatTotal({ value: 93, covered: 1, count: 2 }, 0)).toEqual({ text: '93', unknown: 1 });
    expect(formatTotal({ value: 93, covered: 2, count: 2 }, 0)).toEqual({ text: '93', unknown: 0 });
  });
  it('shows ? when nothing is known, and 0 only for a day with no entries', () => {
    expect(formatTotal({ value: null, covered: 0, count: 3 }, 0)).toEqual({ text: '?', unknown: 3 });
    expect(formatTotal({ value: null, covered: 0, count: 0 }, 0)).toEqual({ text: '0', unknown: 0 });
  });
});
