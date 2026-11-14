// Small pieces for the add-food group (Add food, Portion, Diary, Edit entry, D_Log): icons the kit
// does not have, and compact chips that replace sentences (decision 46).
import type { ReactNode } from 'react';

function Svg({ size = 16, children, className }: { size?: number; children: ReactNode; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {children}
    </svg>
  );
}

export function CalendarIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </Svg>
  );
}

export function RepeatIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="M4 11V9a3 3 0 0 1 3-3h12l-3-3M20 13v2a3 3 0 0 1-3 3H5l3 3" />
    </Svg>
  );
}

export function UnknownIcon({ size, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <circle cx="12" cy="12" r="9" strokeDasharray="3 2.4" />
      <path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4M12 16.6v.01" />
    </Svg>
  );
}

/** "? 2": some entries have no value for a total (rule 2). The full meaning is in the label. */
export function UnknownCount({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null;
  const label = `${count} ${count === 1 ? 'entry has' : 'entries have'} no value for this`;
  return (
    <span role="img" aria-label={label} title={label} className={`inline-flex items-center gap-0.5 align-middle text-[12px] font-semibold text-secondary ${className}`}>
      <UnknownIcon size={14} />
      <span className="num" aria-hidden="true">{count}</span>
    </span>
  );
}

/** A small pill: an icon and a short value. */
export function InfoChip({ icon, children, label, tone = 'plain', testId }: { icon: ReactNode; children: ReactNode; label?: string; tone?: 'plain' | 'accent'; testId?: string }) {
  return (
    <span
      title={label}
      aria-label={label}
      role={label ? 'img' : undefined}
      data-testid={testId}
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-semibold ${tone === 'accent' ? 'border-[#4A2D1C] text-accent-2' : 'border-border bg-raised text-soft'}`}
    >
      {icon}
      <span aria-hidden={label ? true : undefined}>{children}</span>
    </span>
  );
}

/** Protein, carbs and fat as parts of one bar, by weight. Empty unless all three are known. */
export function MacroSplit({ values, className = '' }: { values: Record<string, number | null>; className?: string }) {
  const parts = [values.protein_g, values.carbs_g, values.fat_g];
  const known = parts.every((v) => v !== null) && parts.some((v) => (v as number) > 0);
  const colours = ['bg-accent', 'bg-accent-2', 'bg-accent-3'];
  return (
    <div className={`flex h-2.5 gap-0.5 overflow-hidden rounded-[5px] bg-border ${className}`} aria-hidden="true">
      {known && parts.map((v, i) => (v as number) > 0 && <div key={i} className={colours[i]} style={{ flex: `${v} 0 0` }} />)}
    </div>
  );
}
