// The voice runner (#35, decision 49): feeds every line of eval/voice/cases.jsonl through the parser
// and the resolver against a real products.sqlite and writes run.jsonl for eval/voice/score.py.
// Skipped unless VOICE_DB (path to products.sqlite) and VOICE_OUT (path for run.jsonl) are set:
//   VOICE_DB=... VOICE_OUT=... npx vitest run src/data/voiceEval.test.ts
//   python -I eval/voice/score.py --cases eval/voice/cases.jsonl --output <VOICE_OUT>
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseFoodLine } from '../domain/voice';
import { wrapDb } from './sql';
import { sqlite } from './testing';
import { resolveItems } from './voiceResolve';

const DB = process.env.VOICE_DB;
const OUT = process.env.VOICE_OUT;

describe.skipIf(!DB || !OUT)('voice eval runner', () => {
  it('writes run.jsonl', async () => {
    const s = await sqlite();
    const bytes = new Uint8Array(readFileSync(DB as string));
    const db = new s.oo1.DB(':memory:');
    const p = s.wasm.allocFromTypedArray(bytes);
    const rc = s.capi.sqlite3_deserialize(db.pointer!, 'main', p, bytes.byteLength, bytes.byteLength, s.capi.SQLITE_DESERIALIZE_FREEONCLOSE | s.capi.SQLITE_DESERIALIZE_RESIZEABLE);
    expect(rc).toBe(0);
    const sql = wrapDb(db);
    const casesPath = fileURLToPath(new URL('../../../../eval/voice/cases.jsonl', import.meta.url));
    const cases = readFileSync(casesPath, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as { id: string; text: string });
    const lines = cases.map((c) => {
      const items = resolveItems(sql, parseFoodLine(c.text)).map((r) => {
        // A range is any amount inside it, so its middle stands for it; no amount is one serving.
        const q = r.quantity === null ? 1 : Array.isArray(r.quantity) ? (r.quantity[0] + r.quantity[1]) / 2 : r.quantity;
        return { product_id: r.candidates[0]?.id ?? null, quantity: q, unit: r.unit ?? 'serving', query: r.query };
      });
      return JSON.stringify({ id: c.id, items });
    });
    writeFileSync(OUT as string, lines.join('\n') + '\n');
    expect(lines.length).toBe(cases.length);
  }, 120_000);
});
