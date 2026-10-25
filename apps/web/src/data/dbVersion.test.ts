import { describe, expect, it } from 'vitest';
import { compareDbVersion, isNewerDbVersion } from './dbVersion';

describe('db_version order (products-db.md: YYYY.MM.DD, then -2, -3 for later builds that day)', () => {
  it('orders by date', () => {
    expect(compareDbVersion('2026.10.25', '2026.10.18')).toBeGreaterThan(0);
    expect(compareDbVersion('2026.09.30', '2026.10.01')).toBeLessThan(0);
  });
  it('puts a second build the same day after the first', () => {
    expect(compareDbVersion('2026.10.25-2', '2026.10.25')).toBeGreaterThan(0);
    expect(compareDbVersion('2026.10.25-10', '2026.10.25-9')).toBeGreaterThan(0);
    // The upload script writes the same suffix as .N; both read the same.
    expect(compareDbVersion('2026.10.25.2', '2026.10.25-2')).toBe(0);
  });
  it('treats nothing installed as older than anything', () => {
    expect(isNewerDbVersion('2026.10.25', null)).toBe(true);
    expect(isNewerDbVersion('2026.10.25', '2026.10.25')).toBe(false);
    expect(isNewerDbVersion('2026.10.24', '2026.10.25')).toBe(false);
  });
  it('refuses a malformed version instead of guessing', () => {
    expect(() => compareDbVersion('latest', '2026.10.25')).toThrow();
  });
});
