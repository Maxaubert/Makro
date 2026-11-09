import { describe, expect, it } from 'vitest';
import { averageTitle, axisLabels, coverageLine, onTargetText, vsGoalText } from './trendsCopy';

describe('vsGoalText', () => {
  it('says how far under or over, from the rounded average so the two numbers add up', () => {
    expect(vsGoalText({ average: 2167.7, target: 2400, covered: 7, count: 7 })).toBe('232 under goal');
    expect(vsGoalText({ average: 2500.4, target: 2400, covered: 7, count: 7 })).toBe('100 over goal');
    expect(vsGoalText({ average: 2399.6, target: 2400, covered: 7, count: 7 })).toBe('On goal');
  });

  it('marks a bound when some entries have no value', () => {
    expect(vsGoalText({ average: 2000, target: 2400, covered: 6, count: 7 })).toBe('≤ 400 under goal');
    expect(vsGoalText({ average: 2500, target: 2400, covered: 6, count: 7 })).toBe('≥ 100 over goal');
  });

  it('has no comparison without a goal or an average', () => {
    expect(vsGoalText({ average: 2000, target: null, covered: 1, count: 1 })).toBe('No goal set');
    expect(vsGoalText({ average: null, target: 2400, covered: 0, count: 0 })).toBe('');
  });
});

describe('averageTitle', () => {
  it('names the range and the weekly bars', () => {
    expect(averageTitle('7D')).toBe('Average intake, last 7 days');
    expect(averageTitle('30D')).toBe('Average intake, last 30 days');
    expect(averageTitle('90D')).toBe('Average intake, last 90 days (weekly)');
  });
});

describe('axisLabels', () => {
  const bars = (froms: string[]) => froms.map((from) => ({ from, to: from, value: null, band: null }));

  it('uses the weekday and day for 7D', () => {
    expect(axisLabels(bars(['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']), '7D')).toEqual(['Sun 11', 'Wed 14', 'Today']);
  });

  it('uses day and month for the longer ranges', () => {
    expect(axisLabels(bars(['2026-07-20', '2026-09-01', '2026-10-11']), '90D')).toEqual(['20 Jul', '1 Sep', 'Today']);
  });
});

describe('onTargetText', () => {
  it('counts judged days', () => {
    expect(onTargetText(4, 7)).toBe('4 of 7');
  });

  it('is unknown with no goal or no judged day, never 0', () => {
    expect(onTargetText(null, 3)).toBe('?');
    expect(onTargetText(0, 0)).toBe('?');
  });
});

describe('coverageLine', () => {
  it('is empty when everything is known or nothing is logged', () => {
    expect(coverageLine('Calories', { covered: 3, count: 3 })).toBe('');
    expect(coverageLine('Calories', { covered: 0, count: 0 })).toBe('');
  });

  it('says how many entries it covers', () => {
    expect(coverageLine('Fibre', { covered: 2, count: 6 })).toBe('Fibre covers 2 of 6 entries.');
  });
});
