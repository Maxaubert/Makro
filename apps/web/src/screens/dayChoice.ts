// Count or leave out a day (decision 47). Shared by the weekly card on Today and the desktop Diary panel:
// a day's bar is a button; one tap leaves a counted day out, or counts a left-out one. Nothing else asks.
import type { CSSProperties } from 'react';
import type { DayChoice, WeeklyDay } from '../domain/guidance';
import { weekday } from './guidanceCopy';

/** A left-out day's bar: thin stripes instead of a fill, so it reads as "not in the average". */
export const SKIPPED_BAR: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, var(--color-strong) 0 3px, transparent 3px 6px)',
  boxShadow: 'inset 0 0 0 1px var(--color-strong)',
};

/** What one tap does: a counted day is left out, a left-out day is counted. */
export function nextChoice(d: Pick<WeeklyDay, 'counted'>): DayChoice {
  return d.counted ? 'skip' : 'count';
}

/** The button's label and hover text, e.g. "Mon 144 kcal: looks partly logged, not counted. Tap to count it." */
export function dayChoiceLabel(d: Pick<WeeklyDay, 'local_date' | 'counted' | 'skipped'>, amount: string): string {
  const head = `${weekday(d.local_date)} ${amount}`;
  if (d.skipped === 'auto') return `${head}: looks partly logged, not counted. Tap to count it.`;
  if (d.skipped === 'user') return `${head}: left out by you. Tap to count it.`;
  return `${head}: counted. Tap to leave it out.`;
}
