import { beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from './sql';
import { fixtureProducts } from './testing';
import { norwegianQuery, resolveItem } from './voiceResolve';

describe('norwegianQuery', () => {
  it('turns spoken English food words into Norwegian, phrases first', () => {
    expect(norwegianQuery('orange juice')).toBe('appelsinjuice');
    expect(norwegianQuery('eggs')).toBe('egg');
    expect(norwegianQuery('chicken breast')).toBe('kyllingfilet');
    expect(norwegianQuery('greek yogurt')).toBe('gresk yoghurt');
  });
  it('leaves Norwegian and brand words alone', () => {
    expect(norwegianQuery('kjøttdeig')).toBeNull();
    expect(norwegianQuery('yt proteinmelk')).toBeNull();
  });
});

describe('resolveItem', () => {
  let db: Sql;
  beforeAll(async () => {
    db = await fixtureProducts();
  });
  it('keeps the parsed amount and offers candidates from the normal search', () => {
    const r = resolveItem(db, { query: 'skyr', quantity: 150, unit: 'g' });
    expect(r.quantity).toBe(150);
    expect(r.unit).toBe('g');
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.candidates[0].name.toLowerCase()).toContain('skyr');
  });
  it('drops words until something matches', () => {
    const r = resolveItem(db, { query: 'skyr qwxzv', quantity: null, unit: null });
    expect(r.candidates[0].name.toLowerCase()).toContain('skyr');
  });
  it('has no candidates for a food that is not there, so the app offers a custom food (rule 5)', () => {
    expect(resolveItem(db, { query: 'qwxzv', quantity: 1, unit: 'piece' }).candidates).toEqual([]);
  });
});
