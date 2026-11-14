// Small stroke icons and the info chip of Today, its guidance cards and the end-of-day screen
// (decision 46: icons and short chips instead of explanation sentences).
import type { ReactNode } from 'react';

const paths = {
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  moon: <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />,
  gap: <path d="M4 12h4M16 12h4M10 8v8M14 8v8" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  partial: (
    <>
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17" />
      <path d="M12 20.5a8.5 8.5 0 0 1 0-17" strokeDasharray="2.2 2.6" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5" />
      <path d="M3.5 4v4.5H8M12 8v4l3 2" />
    </>
  ),
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  check: <path d="M5 12l5 5 9-10" />,
  alert: (
    <>
      <path d="M12 8v5M12 16.5v.01" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  bowl: (
    <>
      <path d="M3.5 11h17a8.5 8.5 0 0 1-17 0z" />
      <path d="M9 7.5c0-1.5 1.5-1.5 1.5-3M13.5 7.5c0-1.5 1.5-1.5 1.5-3" />
    </>
  ),
};

export type GuidanceIconName = keyof typeof paths;

export function GIcon({ name, size = 16, stroke = 2, className }: { name: GuidanceIconName; size?: number; stroke?: number; className?: string }) {
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
      aria-hidden="true"
      className={`shrink-0 ${className ?? ''}`}
    >
      {paths[name]}
    </svg>
  );
}

/** A small pill: an icon and a short number or word. The full meaning is its label, for screen readers and on hover. */
export function InfoChip({ icon, label, children, testId, tone = 'plain' }: { icon: GuidanceIconName; label: string; children: ReactNode; testId?: string; tone?: 'plain' | 'warn' }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-testid={testId}
      className={`num inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[13px] font-semibold ${
        tone === 'warn' ? 'border-[#4A2D1C] bg-[#1E1713] text-accent-2' : 'border-border bg-raised text-soft'
      }`}
    >
      <GIcon name={icon} size={14} />
      {children}
    </span>
  );
}
