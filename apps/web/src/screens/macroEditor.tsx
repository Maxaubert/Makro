// The macro split on the goal form: a percent field per macro and a bar that shows the split.
// Each share moves on its own; the goal saves only when the three add up to 100 (decision 40). The
// grams follow the calories (domain/goals.ts). Used by onboarding, Edit goals and desktop Goals.
import { useState } from 'react';
import { formatNumber } from '../domain/format';
import type { GoalEvaluation } from '../domain/goalForm';
import { setShare, sharesTotal, type MacroKey, type Shares } from '../domain/goals';
import { Icon } from '../ui/kit';

export const MACROS: { key: MacroKey; name: string; dot: string }[] = [
  { key: 'protein', name: 'Protein', dot: 'bg-accent' },
  { key: 'carbs', name: 'Carbs', dot: 'bg-accent-2' },
  { key: 'fat', name: 'Fat', dot: 'bg-accent-3' },
];

/** The split as a bar. Under 100 % the rest of the track stays empty; over 100 % the bar is scaled to fit. */
function SplitBar({ shares }: { shares: Shares | null }) {
  const scale = shares ? Math.max(sharesTotal(shares), 100) : 100;
  return (
    <div aria-hidden="true" data-testid="macro-split" className="flex h-11 items-center">
      <div className="flex h-3.5 w-full gap-[3px] overflow-hidden rounded-full bg-border">
        {shares &&
          MACROS.filter((m) => shares[m.key] > 0).map((m) => (
            <div key={m.key} className={`h-full ${m.dot} transition-[width] duration-200`} style={{ width: `${(shares[m.key] / scale) * 100}%` }} />
          ))}
      </div>
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
  const grid = wide ? 'grid grid-cols-[minmax(0,1fr)_128px_72px_72px] gap-3' : 'grid grid-cols-[minmax(0,1fr)_128px_minmax(60px,auto)] gap-2.5';
  const total = e.sharesTotal;
  const off = total !== null && total !== 100;
  const kcalText = (k: MacroKey) => (e.macroKcal ? `${formatNumber(e.macroKcal[k], 0)} kcal` : '– kcal');
  return (
    <div>
      <SplitBar shares={shares} />
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
          <span className={`num text-center font-semibold ${off ? 'text-accent-2' : 'text-text'}`} data-testid="split-total">{total === null ? '–' : `${total}%`}</span>
          <span className="whitespace-nowrap text-right">{!wide && e.macroKcal ? <span className="num">{formatNumber(e.macroKcal.protein + e.macroKcal.carbs + e.macroKcal.fat, 0)} kcal</span> : null}</span>
          {wide && <span className="num text-right font-semibold text-text">{e.macroKcal ? formatNumber(e.macroKcal.protein + e.macroKcal.carbs + e.macroKcal.fat, 0) : '–'}</span>}
        </div>
      </div>
      {off && (
        <p className="mt-2 text-[13px] font-semibold text-accent-2" role="status">
          {total! > 100 ? `${total! - 100}% over.` : `${100 - total!}% short.`} Make it 100% to save.
        </p>
      )}
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
