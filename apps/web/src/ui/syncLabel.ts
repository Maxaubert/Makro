// The sync line of the sidebar's user card (D Night boards).
import type { SyncStatus } from '../data/sync';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export function syncLabel(sync: SyncStatus, pending: number, now: Date = new Date()): string {
  if (sync.state === 'offline') return pending > 0 ? `Offline · ${pending} to sync` : 'Offline';
  if (sync.state === 'syncing') return 'Syncing';
  if (sync.state === 'error') return pending > 0 ? `${pending} not synced` : 'Sync failed';
  if (pending > 0) return `${pending} to sync`;
  if (!sync.lastSyncedAt) return 'Not synced yet';
  const since = now.getTime() - sync.lastSyncedAt.getTime();
  if (since < MINUTE) return 'Synced just now';
  if (since < HOUR) return `Synced ${Math.floor(since / MINUTE)} min ago`;
  return `Synced ${Math.floor(since / HOUR)} h ago`;
}
