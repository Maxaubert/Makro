// D_Diary. Placeholder inside the shell until the board is built.
import { DesktopShell } from '../../ui/desktop';

/** `date` is the day in the route (#/diary/2026-10-25), absent for today. */
export function DesktopDiary({ date: _date }: { date?: string }) {
  return <DesktopShell active="diary" subtitle="Every entry, with macros" title="Diary" />;
}
