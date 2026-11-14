import { describe, expect, it } from 'vitest';
import { averageTitle, axisLabels, coverageCount, coverageLabel, daysLabel, onTargetText, vsGoalText } from './trendsCopy';

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
  it('is short; the range chip names the range, and 90D says its bars are weeks', () => {
    expect(averageTitle('7D')).toBe('Daily average');
    expect(averageTitle('30D')).toBe('Daily average');
    expect(averageTitle('90D')).toBe('Daily average, by week');
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
    expect(onTargetText(4, 7)).toBe('4/7');
  });

  it('is unknown with no goal or no judged day, never 0', () => {
    expect(onTargetText(null, 3)).toBe('?');
    expect(onTargetText(0, 0)).toBe('?');
  });
});

describe('coverageCount', () => {
  it('is empty when everything is known or nothing is logged', () => {
    expect(coverageCount({ covered: 3, count: 3 })).toBe('');
    expect(coverageCount({ covered: 0, count: 0 })).toBe('');
  });

  it('counts the entries with a value', () => {
    expect(coverageCount({ covered: 2, count: 6 })).toBe('2/6');
    expect(coverageCount({ covered: 0, count: 5 })).toBe('0/5');
  });

  it('keeps the full meaning for screen readers', () => {
    expect(coverageLabel('Fibre', { covered: 2, count: 6 })).toBe('Fibre: 2 of 6 entries have a value; the others are left out, not counted as 0');
  });
});

describe('daysLabel', () => {
  const dates = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];

  it('counts the days and names the ones left out', () => {
    expect(daysLabel({ counted_days: 4, dates, left_out: ['2026-11-10'] })).toBe('4 of 5 days counted, Tue not logged and left out');
    expect(daysLabel({ counted_days: 5, dates, left_out: [] })).toBe('5 of 5 days counted');
  });
});
describe('daysLabel with partly logged days (decision 47)', () => {
  it('adds why logged days are not counted', () => {
    const dates = ['2026-11-09', '2026-11-10', '2026-11-11'];
    expect(daysLabel({ counted_days: 1, dates, left_out: ['2026-11-11'], skipped: [{ local_date: '2026-11-09', why: 'auto' }, { local_date: '2026-11-10', why: 'user' }] })).toBe(
      '1 of 3 days counted, Wed not logged and left out; Mon partly logged and left out; Tue untracked',
    );
  });
});
