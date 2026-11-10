// The macro split on the goal form: a bar with two dividers to drag, and a percent field per macro.
// The three shares always add up to 100 and the grams follow the calories (domain/goals.ts), so the
// targets can never disagree with the calorie goal. Used by onboarding, Edit goals and desktop Goals.
import { useRef, useState, type PointerEvent } from 'react';
import { formatNumber } from '../domain/format';
import type { GoalEvaluation } from '../domain/goalForm';
import { moveBoundary, setShare, type MacroBoundary, type MacroKey, type Shares } from '../domain/goals';
import { Icon } from '../ui/kit';

export const MACROS: { key: MacroKey; name: string; dot: string }[] = [
  { key: 'protein', name: 'Protein', dot: 'bg-accent' },
  { key: 'carbs', name: 'Carbs', dot: 'bg-accent-2' },
  { key: 'fat', name: 'Fat', dot: 'bg-accent-3' },
];

/** Drag anywhere on the bar: the nearest divider follows. Keyboard users have the percent fields. */
function SplitBar({ shares, onChange }: { shares: Shares | null; onChange: (s: Shares) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<MacroBoundary | null>(null);
  const at = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * 100;
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (!shares) return;
    const x = at(e);
    const first = shares.protein;
    const second = shares.protein + shares.carbs;
    // When the dividers sit on top of each other, the side you press on decides which one moves.
    const boundary: MacroBoundary = Math.abs(x - first) < Math.abs(x - second) || (first === second && x <= first) ? 'protein_carbs' : 'carbs_fat';
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(boundary);
    onChange(moveBoundary(shares, boundary, x));
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging && shares) onChange(moveBoundary(shares, dragging, at(e)));
  };
  const handle = (left: number) => (
    <span
      className={`pointer-events-none absolute top-1/2 h-7 w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-text shadow-[0_2px_8px_rgb(0_0_0/0.6)] transition-transform ${dragging ? 'scale-y-110' : ''}`}
      style={{ left: `${left}%` }}
    />
  );
  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-testid="macro-split"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={() => setDragging(null)}
      onPointerCancel={() => setDragging(null)}
      className={`relative flex h-11 touch-none select-none items-center ${shares ? 'cursor-ew-resize' : ''}`}
    >
      <div className="flex h-3.5 w-full gap-[3px] overflow-hidden rounded-full">
        {shares ? (
          MACROS.filter((m) => shares[m.key] > 0).map((m) => <div key={m.key} className={`h-full ${m.dot}`} style={{ width: `${shares[m.key]}%` }} />)
        ) : (
          <div className="h-full w-full bg-border" />
        )}
      </div>
      {shares && handle(shares.protein)}
      {shares && handle(shares.protein + shares.carbs)}
    </div>
  );
}

/** A whole percent you can type or step. While typing, a half-typed number is kept as text. */
function PercentStepper({ name, value, onChange }: { name: string; value: number | null; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const disabled = value === null;
  const step = (d: number) => value !== null && onChange(value + d);
  const btn = 'tap flex h-11 w-9 shrink-0 items-center justify-center text-secondary hover:text-text disabled:opacity-30';
  return (
    <div className="flex h-11 items-center rounded-full border border-border bg-raised focus-within:border-accent-2">
      <button type="button" aria-label={`Less ${name.toLowerCase()}`} disabled={disabled || value <= 0} onClick={() => step(-1)} className={btn}>
        <Icon name="minus" size={16} stroke={2.2} />
      </button>
      <label className="flex min-w-0 items-baseline justify-center">
        <input
          inputMode="numeric"
          aria-label={`${name} share`}
          disabled={disabled}
          value={draft ?? (value === null ? '' : String(value))}
          placeholder="–"
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const text = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
            setDraft(text);
            if (text !== '') onChange(Number(text));
          }}
          onBlur={() => setDraft(null)}
          className="num w-[3ch] bg-transparent text-right text-[16px] font-bold outline-none placeholder:text-faint"
        />
        <span className="text-[13px] font-semibold text-secondary">%</span>
      </label>
      <button type="button" aria-label={`More ${name.toLowerCase()}`} disabled={disabled || value >= 100} onClick={() => step(1)} className={btn}>
        <Icon name="plus" size={16} stroke={2.2} />
      </button>
    </div>
  );
}

/**
 * The split and the gram targets it gives. `wide` adds a kcal column (desktop); the phone shows the
 * kcal under each name. Fibre is not part of the calories, so the caller places its own field.
 */
export function MacroEditor({ evaluation: e, onShares, wide = false }: { evaluation: GoalEvaluation; onShares: (s: Shares) => void; wide?: boolean }) {
  const shares = e.shares;
  const grid = wide ? 'grid grid-cols-[minmax(0,1fr)_128px_72px_72px] gap-3' : 'grid grid-cols-[minmax(0,1fr)_128px_60px] gap-2.5';
  const kcalText = (k: MacroKey) => (e.macroKcal ? `${formatNumber(e.macroKcal[k], 0)} kcal` : '– kcal');
  return (
    <div>
      <SplitBar shares={shares} onChange={onShares} />
      <div className="mt-1">
        <div className={`${grid} pb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-faint`}>
          <span>Macro</span>
          <span className="text-center">Share of kcal</span>
          <span className="text-right">Grams</span>
          {wide && <span className="text-right">kcal</span>}
        </div>
        {MACROS.map((m) => (
          <div key={m.key} className={`${grid} items-center border-t border-border py-2.5`}>
            <span className="flex min-w-0 items-center gap-2.5">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${m.dot}`} />
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">{m.name}</span>
                {!wide && <span className="num block text-[12px] text-secondary">{kcalText(m.key)}</span>}
              </span>
            </span>
            <PercentStepper name={m.name} value={shares ? shares[m.key] : null} onChange={(v) => shares && onShares(setShare(shares, m.key, v))} />
            <span className="num text-right text-[16px] font-bold" data-testid={`${m.key}-grams`}>
              {e.shown[m.key] === '' ? '–' : e.shown[m.key]}
              <span className="text-[13px] font-semibold text-secondary"> g</span>
            </span>
            {wide && <span className="num text-right text-[15px] text-secondary">{e.macroKcal ? formatNumber(e.macroKcal[m.key], 0) : '–'}</span>}
          </div>
        ))}
        <div className={`${grid} items-center border-t border-border pt-2.5 text-[13px] text-secondary`}>
          <span>Total</span>
          <span className="num text-center font-semibold text-text">{shares ? '100%' : '–'}</span>
          <span className="whitespace-nowrap text-right">{!wide && e.macroKcal ? <span className="num">{formatNumber(e.macroKcal.protein + e.macroKcal.carbs + e.macroKcal.fat, 0)} kcal</span> : null}</span>
          {wide && <span className="num text-right font-semibold text-text">{e.macroKcal ? formatNumber(e.macroKcal.protein + e.macroKcal.carbs + e.macroKcal.fat, 0) : '–'}</span>}
        </div>
      </div>
    </div>
  );
}

/** Shown when a saved goal's macros did not add up to its calories and the form corrected them. */
export function RepairedNote({ evaluation: e }: { evaluation: GoalEvaluation }) {
  if (e.repairedFromKcal === null) return null;
  return (
    <p className="mt-3 rounded-2xl border border-accent/40 bg-accent-tint px-4 py-3 text-[13px] leading-relaxed">
      Your saved macros added up to {formatNumber(Math.round(e.repairedFromKcal), 0)} kcal, not {formatNumber(Number(e.shown.kcal), 0)}. They now follow
      your calories with the same split. Save to keep this.
    </p>
  );
}
