// Main-thread handle on the database worker: every method of DbApi, returning a Promise.
import type { DbApi } from '../worker/db.worker';

type Remote<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : never };

export type Db = Remote<DbApi>;

export function createDb(): Db {
  const worker = new Worker(new URL('../worker/db.worker.ts', import.meta.url), { type: 'module' });
  let next = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  worker.onmessage = (ev: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
    const p = pending.get(ev.data.id);
    if (!p) return;
    pending.delete(ev.data.id);
    if (ev.data.ok) p.resolve(ev.data.result);
    else p.reject(new Error(ev.data.error));
  };
  worker.onerror = (ev) => {
    for (const p of pending.values()) p.reject(new Error(ev.message || 'database worker failed'));
    pending.clear();
  };
  return new Proxy({} as Db, {
    get(_t, method: string) {
      return (...args: unknown[]) =>
        new Promise((resolve, reject) => {
          const id = next++;
          pending.set(id, { resolve, reject });
          const transfer = args.filter((a): a is Uint8Array => a instanceof Uint8Array).map((a) => a.buffer as ArrayBuffer);
          worker.postMessage({ id, method, args }, transfer);
        });
    },
  });
}
