// Small stroke icons and the count chip of the desktop home screens (Today, Diary, Trends, Goals, Profile).
// A chip says with an icon and a number what a sentence used to say; its label keeps the sentence for screen readers.
import type { ReactNode } from 'react';

const paths = {
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2.5" />
      <path d="M4 10h16M8.5 3v4M15.5 3v4" />
    </>
  ),
  unknown: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.1-2.4 3.6M12 17h.01" />
    </>
  ),
  down: <path d="M4 7l6 6 4-4 6 6M20 10v5h-5" />,
  flat: <path d="M4 12h16M16 8l4 4-4 4" />,
  up: <path d="M4 17l6-6 4 4 6-6M20 14V9h-5" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  sync: <path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9M18 3v4.5h-4.5M6 21v-4.5h4.5" />,
  notSynced: (
    <>
      <path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z" />
      <path d="M4 4l16 16" />
    </>
  ),
  daily: <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />,
  scale: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8.5 9.5a5 5 0 0 1 7 0M12 13l2-2.5" />
    </>
  ),
};

export type HomeIconName = keyof typeof paths;

export function HomeIcon({ name, size = 16, stroke = 1.9, className, label }: { name: HomeIconName; size?: number; stroke?: number; className?: string; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className ?? ''}`}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {label && <title>{label}</title>}
      {paths[name]}
    </svg>
  );
}

/** [icon] 4/5: a compact count. `label` is the full meaning, shown on hover and read by screen readers. */
export function CountChip({ icon, label, children, testId, tone = 'plain' }: { icon: HomeIconName; label: string; children: ReactNode; testId?: string; tone?: 'plain' | 'warn' }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-testid={testId}
      className={`num inline-flex h-6 shrink-0 items-center gap-1 rounded-xl px-2 text-[12px] font-semibold ${tone === 'warn' ? 'bg-[#2A1308] text-accent-2' : 'bg-raised text-soft'}`}
    >
      <HomeIcon name={icon} size={13} stroke={2.1} />
      {children}
    </span>
  );
}

/** "? 2": some entries have no value for this total, so it is a lower bound. Never shown as 0 (rule 2). */
export function UnknownChip({ count, what = 'a value', testId }: { count: number; what?: string; testId?: string }) {
  if (count <= 0) return null;
  return (
    <CountChip icon="unknown" tone="warn" testId={testId} label={`${count} ${count === 1 ? 'entry has' : 'entries have'} no ${what}, left out`}>
      {count}
    </CountChip>
  );
}
