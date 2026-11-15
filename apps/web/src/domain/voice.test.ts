import { describe, expect, it } from 'vitest';
import { loadGolden } from './golden';
import { parseFoodLine, type ParsedItem } from './voice';

describe('voice/parse.json', () => {
  const golden = loadGolden<{ text: string }, { items: ParsedItem[] }>('voice/parse.json');
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(parseFoodLine(c.input.text)).toEqual(c.expected.items);
  });
});
