// Left-out days (decision 47), shared by the weekly card on Today, the desktop Diary panel and Trends.
// A day is counted or left out with the Track / Untrack button on the desktop Diary day card.
import type { CSSProperties } from 'react';
import type { WeeklyDay } from '../domain/guidance';
import { weekday } from './guidanceCopy';

/** A left-out day's bar: thin stripes instead of a fill, so it reads as "not in the average". */
export const SKIPPED_BAR: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, var(--color-strong) 0 3px, transparent 3px 6px)',
  boxShadow: 'inset 0 0 0 1px var(--color-strong)',
};

/** Hover text for a day's bar, e.g. "Mon 144 kcal: looks partly logged, not counted". */
export function dayStatusLabel(d: Pick<WeeklyDay, 'local_date' | 'counted' | 'skipped'>, amount: string): string {
  const head = `${weekday(d.local_date)} ${amount}`;
  if (d.skipped === 'auto') return `${head}: looks partly logged, not counted`;
  if (d.skipped === 'user') return `${head}: untracked, not counted`;
  return head;
}
