import { describe, expect, it } from 'vitest';
import { loadGolden } from './golden';
import { loggingStreak, streakLabel } from './streak';

const golden = loadGolden<{ logged_days: string[]; today: string }, { days: number }>('guidance/streak.json');

describe('guidance/streak.json', () => {
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(loggingStreak(c.input.logged_days, c.input.today)).toBe(c.expected.days);
  });
});

describe('streakLabel', () => {
  it('names the number of days', () => {
    expect(streakLabel(6)).toBe('6 day streak');
    expect(streakLabel(1)).toBe('1 day streak');
  });

  it('has no number when there is no streak', () => {
    expect(streakLabel(0)).toBe('No streak yet');
  });
});
