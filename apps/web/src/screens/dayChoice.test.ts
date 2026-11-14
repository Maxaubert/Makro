import { describe, expect, it } from 'vitest';
import { dayChoiceLabel, nextChoice } from './dayChoice';

describe('count or leave out a day (decision 47)', () => {
  it('flips with one tap', () => {
    expect(nextChoice({ counted: true })).toBe('skip');
    expect(nextChoice({ counted: false })).toBe('count');
  });
  it('says why a day is not counted and what a tap does', () => {
    expect(dayChoiceLabel({ local_date: '2026-11-09', counted: false, skipped: 'auto' }, '144 kcal')).toBe('Mon 144 kcal: looks partly logged, not counted. Tap to count it.');
    expect(dayChoiceLabel({ local_date: '2026-11-10', counted: false, skipped: 'user' }, '2,100 kcal')).toBe('Tue 2,100 kcal: left out by you. Tap to count it.');
    expect(dayChoiceLabel({ local_date: '2026-11-11', counted: true, skipped: null }, '1,900 kcal')).toBe('Wed 1,900 kcal: counted. Tap to leave it out.');
  });
});
