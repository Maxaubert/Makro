// Which routes have a desktop screen. A route that is not listed keeps the phone column at desktop width.
// Today is App's default route, so it is chosen there.
import type { ReactElement } from 'react';
import { DesktopDiary } from './DesktopDiary';
import { DesktopGoals } from './DesktopGoals';
import { DesktopLog } from './DesktopLog';
import { DesktopProfile } from './DesktopProfile';
import { DesktopTrends } from './DesktopTrends';
import { DesktopWeight } from './DesktopWeight';

export function desktopScreen(screen: string | undefined, a: string | undefined): ReactElement | null {
  switch (screen) {
    case 'diary':
      // No key: the Diary stays mounted from day to day, so the layout does not empty and jump.
      return <DesktopDiary date={a} />;
    case 'add':
      return <DesktopLog />;
    case 'weight':
      return <DesktopWeight />;
    case 'trends':
      return <DesktopTrends />;
    case 'goals':
      return <DesktopGoals />;
    case 'account':
      return <DesktopProfile />;
    default:
      return null;
  }
}
