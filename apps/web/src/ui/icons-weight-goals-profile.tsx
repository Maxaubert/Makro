// Small stroke icons for Weight, Goals and Account, drawn like the ones in ui/kit.tsx.
import type { ReactNode } from 'react';

const glyphs = {
  trendDown: <path d="M4 7l6 6 4-4 6 6M20 10v5h-5" />,
  trendUp: <path d="M4 17l6-6 4 4 6-6M20 14V9h-5" />,
  trendFlat: <path d="M4 12h16M16 8l4 4-4 4" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
    </>
  ),
  flag: <path d="M6 21V4M6 4h11l-2 4 2 4H6" />,
  person: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  alert: (
    <>
      <path d="M12 8v5M12 16.5v.01" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  cloud: <path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z" />,
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    </>
  ),
  app: <rect x="6" y="3" width="12" height="18" rx="3" />,
};

export type GlyphName = keyof typeof glyphs;

export function Glyph({ name, size = 16, stroke = 2, className }: { name: GlyphName; size?: number; stroke?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className ?? ''}`}>
      {glyphs[name]}
    </svg>
  );
}

/** Activity as 1 to 3 rising bars: a small diagram instead of a description. */
export function LevelBars({ level, className = '' }: { level: 1 | 2 | 3; className?: string }) {
  return (
    <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden="true" className={`shrink-0 ${className}`}>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={i * 8} y={12 - i * 6} width="6" height={6 + i * 6} rx="1.5" fill="currentColor" fillOpacity={i < level ? 1 : 0.22} />
      ))}
    </svg>
  );
}

/** A compact fact: an icon and a short value, with the full meaning for screen readers and on hover. */
export function IconChip({ icon, label, children, tone = 'plain', testId }: { icon: GlyphName; label: string; children: ReactNode; tone?: 'plain' | 'accent'; testId?: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-testid={testId}
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-semibold ${tone === 'accent' ? 'border-accent/40 bg-accent-tint text-accent-2' : 'border-border bg-raised text-soft'}`}
    >
      <Glyph name={icon} size={14} />
      {children}
    </span>
  );
}
