import { describe, expect, it } from 'vitest';
import { longDayLabel } from './day';

describe('longDayLabel', () => {
  it('writes the weekday and month in full, as the desktop page header does', () => {
    expect(longDayLabel('2026-10-17')).toBe('Saturday 17 October');
  });
});
