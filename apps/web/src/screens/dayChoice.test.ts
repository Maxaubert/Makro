import { describe, expect, it } from 'vitest';
import { dayStatusLabel } from './dayChoice';

describe('a left-out day on the bars (decision 47)', () => {
  it('says why a day is not counted', () => {
    expect(dayStatusLabel({ local_date: '2026-11-09', counted: false, skipped: 'auto' }, '144 kcal')).toBe('Mon 144 kcal: looks partly logged, not counted');
    expect(dayStatusLabel({ local_date: '2026-11-10', counted: false, skipped: 'user' }, '2,100 kcal')).toBe('Tue 2,100 kcal: untracked, not counted');
    expect(dayStatusLabel({ local_date: '2026-11-11', counted: true, skipped: null }, '1,900 kcal')).toBe('Wed 1,900 kcal');
  });
});
