// Shared pieces of the B Night look (canvas https://claude.ai/artifact/K6QcNcoePkCkXds6arS4fo):
// dark ground, 20 px cards with a 1 px border, one orange accent, Space Grotesk.
import type { ReactNode } from 'react';
import type { SyncStatus } from '../data/sync';
import { href, useBack, useRoute } from '../lib/hooks';

const paths = {
  back: <path d="M15 5l-7 7 7 7" />,
  home: <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  diary: (
    <>
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <path d="M8 4v13" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  weight: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8.5 9.5a5 5 0 0 1 7 0M12 13l2-2.5" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </>
  ),
  barcode: <path d="M4 6v12M7 6v12M11 6v12M14 6v12M17 6v12M20 6v12" />,
  check: <path d="M5 12l5 5 9-10" />,
  alert: (
    <>
      <path d="M12 8v5M12 16.5v.01" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  next: <path d="M9 5l7 7-7 7" />,
  erase: <path d="M21 5H9l-6 7 6 7h12zM17 9l-6 6M11 9l6 6" />,
  cloud: <path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z" />,
  noBarcode: (
    <>
      <path d="M4 6v12M7 6v12M11 6v12M14 6v12M17 6v12M20 6v12" />
      <path d="M3 21L21 3" />
    </>
  ),
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 24, stroke = 1.8, className }: { name: IconName; size?: number; stroke?: number; className?: string }) {
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
      className={className}
    >
      {paths[name]}
    </svg>
  );
}

/** The phone column. On a PC it is a centred column (a wider dashboard comes later). */
export function Page({ children, nav = false }: { children: ReactNode; nav?: boolean }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col">
      <main className={`flex flex-1 flex-col px-4 pt-[max(env(safe-area-inset-top),24px)] ${nav ? 'pb-28' : 'pb-8'}`}>{children}</main>
      {nav && <BottomNav />}
    </div>
  );
}

export function Header({ title, back, right }: { title: string; back?: string; right?: ReactNode }) {
  const goBack = useBack(back ?? '/today');
  return (
    <header className="flex items-center gap-2 pt-2">
      {back !== undefined && (
        <button type="button" onClick={goBack} aria-label="Back" className="tap -ml-2 flex h-11 w-11 items-center justify-center rounded-full">
          <Icon name="back" stroke={2} />
        </button>
      )}
      <h1 className="flex-1 text-2xl font-bold tracking-[-0.02em]">{title}</h1>
      {right}
    </header>
  );
}

function BottomNav() {
  const [route] = useRoute();
  const item = (to: string, name: IconName, label: string) => {
    const active = route === to;
    return (
      <a
        href={href(to)}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={`tap flex h-11 w-11 items-center justify-center rounded-full ${active ? 'text-accent' : 'text-secondary'}`}
      >
        <Icon name={name} />
      </a>
    );
  };
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[440px] px-4 pb-[max(env(safe-area-inset-bottom),20px)]"
    >
      <div className="grid h-16 grid-cols-5 items-center justify-items-center rounded-full border border-border bg-raised/95 backdrop-blur">
        {item('today', 'home', 'Today')}
        {item('diary', 'diary', 'Diary')}
        <a
          href={href('add')}
          aria-label="Log food"
          className="tap flex h-12 w-12 items-center justify-center rounded-full bg-accent text-ground"
        >
          <Icon name="plus" size={26} stroke={2.4} />
        </a>
        {item('weight', 'weight', 'Weight')}
        {item('account', 'profile', 'Account')}
      </div>
    </nav>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function PrimaryButton({ children, disabled, onClick, type = 'button' }: { children: ReactNode; disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="tap flex h-14 w-full items-center justify-center rounded-full bg-accent text-base font-bold text-ground disabled:border disabled:border-border disabled:bg-raised disabled:text-[#6A6A70]"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick, href: to }: { children: ReactNode; onClick?: () => void; href?: string }) {
  const cls = 'tap flex h-14 w-full items-center justify-center rounded-full border border-border bg-raised text-[15px] font-semibold';
  return to ? (
    <a className={cls} href={to}>
      {children}
    </a>
  ) : (
    <button type="button" className={cls} onClick={onClick}>
      {children}
    </button>
  );
}

export function Chip({ selected, children, onClick }: { selected: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`tap flex h-[34px] shrink-0 items-center rounded-full px-3.5 text-[13px] ${
        selected ? 'bg-text font-bold text-ground' : 'border border-border bg-raised text-[#C8C8CC]'
      }`}
    >
      {children}
    </button>
  );
}

/** Where the numbers come from and whether they are verified (accuracy rule 4). */
export function SourceBadge({ sourceName, verified }: { sourceName: string; verified: boolean | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-secondary">
      <span>{sourceName}</span>
      {verified === true && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-accent-tint px-1.5 py-px font-semibold text-accent-2">
          <Icon name="check" size={11} stroke={3} />
          Verified
        </span>
      )}
      {verified === false && <span className="rounded-full border border-border px-1.5 py-px">Not verified</span>}
    </span>
  );
}

/** "+? in 2 entries": shown next to a total when some entries had no value for it. */
export function UnknownNote({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span className={`text-[12px] text-secondary ${className}`} title="Some entries have no value for this">
      +? in {count} {count === 1 ? 'entry' : 'entries'}
    </span>
  );
}

/** The half-ring calorie gauge of Today. Without a goal the arc stays empty. */
export function HalfGauge({ fraction, label }: { fraction: number | null; label: string }) {
  const length = Math.PI * 120;
  const filled = fraction === null ? 0 : Math.max(0, Math.min(1, fraction)) * length;
  return (
    <svg width="100%" height="150" viewBox="0 0 300 160" role="img" aria-label={label} className="block">
      <path d="M30 150 A120 120 0 0 1 270 150" fill="none" stroke="var(--color-border)" strokeWidth="16" strokeLinecap="round" />
      {filled > 0 && (
        <path
          d="M30 150 A120 120 0 0 1 270 150"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${length}`}
          className="gauge-arc"
        />
      )}
    </svg>
  );
}

export function Ring({ fraction, color, size = 56 }: { fraction: number | null; color: string; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const filled = fraction === null ? 0 : Math.max(0, Math.min(1, fraction)) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border)" strokeWidth="6" />
      {filled > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  );
}

export function SyncPill({ sync, pending }: { sync: SyncStatus; pending: number }) {
  let text: string;
  let dot = 'bg-accent';
  if (sync.state === 'offline') {
    text = pending > 0 ? `Offline · ${pending} to sync` : 'Offline';
    dot = 'bg-[#7A7A80]';
  } else if (sync.state === 'syncing') text = 'Syncing';
  else if (sync.state === 'error') {
    text = pending > 0 ? `${pending} not synced` : 'Sync failed';
    dot = 'bg-danger';
  } else text = pending > 0 ? `${pending} to sync` : 'Synced';
  return (
    <span
      role="status"
      data-testid="sync-status"
      title={sync.error ?? undefined}
      className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-[#1A1A1C] px-3 text-[13px] font-semibold"
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {text}
    </span>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-2xl border px-4 py-3 text-sm ${tone === 'error' ? 'border-danger/60 text-[#FFB38F]' : 'border-border text-secondary'}`}
    >
      {children}
    </div>
  );
}
