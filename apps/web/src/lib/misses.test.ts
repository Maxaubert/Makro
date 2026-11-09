import { describe, expect, it } from 'vitest';
import { flushMissQueue, type MissQueueStore } from './misses';

type M = { id: string };
const store = (initial: M[]): MissQueueStore & { q: M[] } => {
  const s = {
    q: initial,
    read: () => s.q.slice(),
    write: (q: unknown[]) => {
      s.q = q as M[];
    },
  };
  return s;
};
const refused = (status: number) => ({ context: { status } });

describe('flushMissQueue', () => {
  it('removes sent and refused (400) misses and keeps network failures', async () => {
    const s = store([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    await flushMissQueue(s, async (m) => (m.id === 'a' ? null : m.id === 'b' ? refused(400) : new TypeError('offline')));
    expect(s.q).toEqual([{ id: 'c' }]);
  });

  it('keeps a 429 and stops sending until the next flush', async () => {
    const s = store([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const sent: string[] = [];
    await flushMissQueue(s, async (m) => {
      sent.push(m.id ?? '');
      return m.id === 'b' ? refused(429) : null;
    });
    expect(sent).toEqual(['a', 'b']);
    expect(s.q).toEqual([{ id: 'b' }, { id: 'c' }]);
  });

  it('keeps a miss queued while the flush was in flight', async () => {
    const s = store([{ id: 'a' }]);
    await flushMissQueue(s, async () => {
      s.q = [...s.q, { id: 'new' }];
      return null;
    });
    expect(s.q).toEqual([{ id: 'new' }]);
  });
});
