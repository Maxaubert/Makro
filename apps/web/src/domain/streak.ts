// The logging streak, pinned by packages/contracts/guidance/streak.json. Pure: no clock, no database.
import { shiftDay } from './weight';

/** Consecutive days with a logged entry, counting back from today, or from yesterday while today is still empty. */
export function loggingStreak(loggedDays: readonly string[], today: string): number {
  const days = new Set(loggedDays);
  let day = days.has(today) ? today : shiftDay(today, -1);
  let streak = 0;
  while (days.has(day)) {
    streak++;
    day = shiftDay(day, -1);
  }
  return streak;
}

export function streakLabel(days: number): string {
  return days > 0 ? `${days} day streak` : 'No streak yet';
}
