// The desktop shell of the D Night boards (1024 px and up): left sidebar, page header, scrolling content.
// Every desktop screen renders inside <DesktopShell>.
import type { ReactNode } from 'react';
import { loggingStreak, streakLabel } from '../domain/streak';
import { href, useApp, useAppState, useData } from '../lib/hooks';
import { today } from '../screens/day';
import { Icon, type IconName } from './kit';
import { syncLabel } from './syncLabel';

export type DesktopNavItem = 'today' | 'diary' | 'add' | 'weight' | 'trends' | 'goals' | 'account';

const NAV: { id: Exclude<DesktopNavItem, 'account'>; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Today', icon: 'home' },
  { id: 'diary', label: 'Diary', icon: 'diary' },
  { id: 'add', label: 'Add food', icon: 'plus' },
  { id: 'weight', label: 'Weight', icon: 'weight' },
  { id: 'trends', label: 'Trends', icon: 'trends' },
  { id: 'goals', label: 'Goals', icon: 'goals' },
];

function DesktopNavLink({ to, label, icon, active }: { to: string; label: string; icon: IconName; active: boolean }) {
  return (
    <a
      href={href(to)}
      aria-current={active ? 'page' : undefined}
      className={`tap relative flex h-[46px] items-center gap-3 rounded-[14px] px-3.5 text-[15px] ${
        active ? 'bg-raised font-semibold text-text' : 'font-medium text-secondary hover:bg-raised/60 hover:text-text'
      }`}
    >
      {active && <span className="absolute inset-y-3 left-0 w-[3px] rounded-sm bg-accent" />}
      <Icon name={icon} size={20} className={active ? 'text-accent' : undefined} />
      {label}
    </a>
  );
}

function DesktopUserCard({ active }: { active: boolean }) {
  const { session, sync, pending } = useAppState();
  const email = session?.user.email ?? '';
  // The account has no display name, so the card shows the part of the email before the @.
  const name = email.split('@')[0] || 'Account';
  return (
    <a
      href={href('account')}
      aria-current={active ? 'page' : undefined}
      title={email || undefined}
      className={`tap mt-auto flex items-center gap-3 rounded-2xl border border-border p-3 ${active ? 'bg-raised' : 'bg-card hover:bg-raised'}`}
    >
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-border font-bold" aria-hidden="true">
        {name[0].toUpperCase()}
      </span>
      <span className="min-w-0 grow">
        <span className="block truncate text-[14px] font-semibold">{name}</span>
        <span className="mt-px block truncate text-[12px] text-secondary" data-testid="sync-status">
          {syncLabel(sync, pending)}
        </span>
      </span>
      <Icon name="next" size={16} className="shrink-0 text-secondary" />
    </a>
  );
}

export function DesktopSidebar({ active }: { active?: DesktopNavItem }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border px-4 pb-5 pt-7">
      <a href={href('today')} className="flex items-center gap-3 px-2 pb-7">
        <img src="/icon.svg" alt="" className="h-9 w-9 rounded-[11px]" aria-hidden="true" />
        <span className="text-[22px] font-bold tracking-[-0.4px]">Makro</span>
      </a>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {NAV.map((item) => (
          <DesktopNavLink key={item.id} to={item.id} label={item.label} icon={item.icon} active={item.id === active} />
        ))}
      </nav>
      <DesktopUserCard active={active === 'account'} />
    </aside>
  );
}

/** Consecutive logged days from the log. Shows nothing until the log has been read. */
export function StreakPill() {
  const app = useApp();
  const { data: days } = useData(() => app.db.loggedDays(), []);
  if (days === undefined) return null;
  return (
    <span data-testid="streak" className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-border bg-raised px-3.5 text-[13px] font-semibold">
      <span className="h-[7px] w-[7px] rounded-full bg-accent" />
      {streakLabel(loggingStreak(days, today()))}
    </span>
  );
}

export function AddFoodButton() {
  return (
    <a href={href('add')} className="tap flex h-[46px] shrink-0 items-center gap-2 rounded-full bg-accent px-[22px] text-[15px] font-bold text-ground">
      <Icon name="plus" size={18} stroke={2.4} />
      Add food
    </a>
  );
}

export function DesktopHeader({ subtitle, title }: { subtitle?: string; title: string }) {
  return (
    <header className="flex h-[88px] shrink-0 items-center gap-4 px-8">
      <div className="mr-auto min-w-0">
        {subtitle && <div className="text-[13px] text-secondary">{subtitle}</div>}
        <h1 className="mt-0.5 text-[30px] font-bold leading-[1.1] tracking-[-0.8px]">{title}</h1>
      </div>
      <StreakPill />
      <AddFoodButton />
    </header>
  );
}

/** `active` marks the sidebar entry, or the user card for 'account'. */
export function DesktopShell({ active, subtitle, title, children }: { active?: DesktopNavItem; subtitle?: string; title: string; children?: ReactNode }) {
  return (
    <div className="desktop-shell flex h-dvh overflow-hidden [line-height:normal]">
      <DesktopSidebar active={active} />
      <main className="desktop-scroll flex min-w-0 flex-1 flex-col overflow-auto">
        <DesktopHeader subtitle={subtitle} title={title} />
        <div className="px-8 pb-8 pt-1">{children}</div>
      </main>
    </div>
  );
}
