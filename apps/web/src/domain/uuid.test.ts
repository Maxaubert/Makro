import { describe, expect, it } from 'vitest';
import { uuidv7 } from './uuid';

// Format from packages/contracts/log-schema.md: UUIDv7, lowercase, 36 characters with hyphens.
const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7', () => {
  it('is a lowercase 36-character UUID with version 7 and the RFC 9562 variant', () => {
    for (let i = 0; i < 100; i++) expect(uuidv7()).toMatch(V7);
  });

  it('puts the Unix time in milliseconds in the first 48 bits', () => {
    const ms = Date.UTC(2026, 9, 20, 8, 15, 30, 123);
    const id = uuidv7(ms);
    const hex = id.replace(/-/g, '').slice(0, 12);
    expect(parseInt(hex, 16)).toBe(ms);
  });

  it('uses the injected random bytes for the rest', () => {
    const bytes = new Uint8Array(16).fill(0xff);
    const id = uuidv7(0, () => bytes);
    expect(id).toBe('00000000-0000-7fff-bfff-ffffffffffff');
  });

  it('sorts by creation time', () => {
    const a = uuidv7(1_000);
    const b = uuidv7(2_000);
    expect(a < b).toBe(true);
  });

  it('is unique across many calls in the same millisecond', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7(5)));
    expect(ids.size).toBe(1000);
  });

  it('refuses a time outside 48 bits', () => {
    expect(() => uuidv7(-1)).toThrow();
    expect(() => uuidv7(2 ** 48)).toThrow();
  });
});
