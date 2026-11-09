// The offline miss queue and its flush (accuracy rule 5: a miss is recorded, never lost).
export interface MissQueueStore {
  read: () => { id?: string }[];
  write: (q: unknown[]) => void;
}

/** Sends one queued miss. Resolves to null on success, or to the error the call gave. */
export type SendMiss = (miss: { id?: string }) => Promise<unknown>;

const keyOf = (m: { id?: string }) => m.id ?? JSON.stringify(m);

function statusOf(error: unknown): number | undefined {
  return (error as { context?: { status?: number } } | null)?.context?.status;
}

/**
 * A 4xx other than 429 means the payload itself is refused, so it is dropped; a network failure or 5xx
 * keeps it. A 429 keeps it and stops the flush until the next one. The queue is re-read after the
 * sends, so a miss added while they were in flight is not overwritten.
 */
export async function flushMissQueue(store: MissQueueStore, send: SendMiss): Promise<void> {
  const batch = store.read();
  if (batch.length === 0) return;
  const finished = new Set<string>();
  for (const miss of batch) {
    const error = await send(miss);
    const status = statusOf(error);
    if (status === 429) break;
    if (!error || (status && status >= 400 && status < 500)) finished.add(keyOf(miss));
  }
  store.write(store.read().filter((m) => !finished.has(keyOf(m))));
}
