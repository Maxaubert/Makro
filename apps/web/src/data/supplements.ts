// Daily supplements on this device (#52): make today's entries, skip today. Numbers come from the
// current food, else the last snapshot, else stay unknown (rules 2 and 3), as in fastRepeat.ts.
import { localDateIn } from '../domain/localDate';
import { dueToday, supplementEntry, type DailySupplementRow } from '../domain/supplements';
import { currentFood, type Catalogue } from './fastRepeat';
import type { LogStore } from './logStore';

function entryFor(log: LogStore, catalogue: Catalogue, s: DailySupplementRow, at: Date, tz: string) {
  const food = currentFood(log, catalogue, s);
  return supplementEntry({ supplement: s, food, snapshot: food ? null : log.latestSnapshot(s), at, tz });
}

/** Make today's entry for every supplement that is due. Returns how many were made. */
export function ensureSupplements(log: LogStore, catalogue: Catalogue, at: Date, tz: string): number {
  const today = localDateIn(at, tz);
  const due = dueToday(log.dailySupplementRows(), log.supplementEntriesOn(today), today);
  // Each entry is a millisecond later, so they keep the section's order.
  log.saveLogEntries(due.map((s, i) => entryFor(log, catalogue, s, new Date(at.getTime() + i), tz)));
  return due.length;
}

/** Skip today: today's entry becomes a tombstone (made first if the day job has not run yet). */
export function skipToday(log: LogStore, catalogue: Catalogue, id: string, at: Date, tz: string): void {
  const s = log.dailySupplement(id);
  if (!s) throw new Error('This supplement is no longer on this device.');
  log.skipSupplementToday(id, localDateIn(at, tz), () => entryFor(log, catalogue, s, at, tz));
}
