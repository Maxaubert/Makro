import { describe, expect, it } from 'vitest';
import type { SyncStatus } from '../data/sync';
import { syncLabel } from './syncLabel';

const now = new Date('2026-10-17T12:00:00.000Z');
const status = (s: Partial<SyncStatus>): SyncStatus => ({ state: 'idle', lastSyncedAt: null, error: null, ...s });
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('syncLabel', () => {
  it('says so when nothing has synced yet', () => {
    expect(syncLabel(status({}), 0, now)).toBe('Not synced yet');
  });

  it('counts time since the last sync', () => {
    expect(syncLabel(status({ lastSyncedAt: ago(5_000) }), 0, now)).toBe('Synced just now');
    expect(syncLabel(status({ lastSyncedAt: ago(5 * 60_000) }), 0, now)).toBe('Synced 5 min ago');
    expect(syncLabel(status({ lastSyncedAt: ago(3 * 3_600_000) }), 0, now)).toBe('Synced 3 h ago');
  });

  it('puts waiting changes before the time', () => {
    expect(syncLabel(status({ lastSyncedAt: ago(5_000) }), 2, now)).toBe('2 to sync');
  });

  it('shows syncing, offline and failure', () => {
    expect(syncLabel(status({ state: 'syncing' }), 0, now)).toBe('Syncing');
    expect(syncLabel(status({ state: 'offline' }), 0, now)).toBe('Offline');
    expect(syncLabel(status({ state: 'offline' }), 3, now)).toBe('Offline · 3 to sync');
    expect(syncLabel(status({ state: 'error' }), 0, now)).toBe('Sync failed');
    expect(syncLabel(status({ state: 'error' }), 3, now)).toBe('3 not synced');
  });
});
