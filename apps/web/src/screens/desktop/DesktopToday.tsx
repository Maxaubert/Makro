// D_Today. Placeholder inside the shell until the board is built.
import { DesktopShell } from '../../ui/desktop';
import { longDayLabel, today } from '../day';

export function DesktopToday() {
  return <DesktopShell active="today" subtitle={longDayLabel(today())} title="Today" />;
}
