// The weekly average as a picture (Max, 2026-11-14): one ring split by where the calories come from
// (protein, carbs, fat), the average kcal in the middle, and two split bars: sugars in the carbs and
// saturated fat in the fat. The numbers sit in tooltips: hover a part (or tap it, or focus it with the
// keyboard). A split shows only when every entry of the week has the value, so a missing number never
// makes a bar look smaller than it is (rule 2). The shares use sharesFromGrams
// (goals/macro_shares.json), so there is no new maths here.
import { useState } from 'react';
import type { WeeklyAverage } from '../domain/guidance';
import { sharesFromGrams } from '../domain/goals';
import { formatNumber } from '../domain/format';

export const MACRO_COLORS = { protein: '#FF4C00', carbs: '#FF8A57', fat: '#FFB38F' } as const;
const SOFT = { sugars: '#FFD2BC', sat: '#FFE3D4' } as const;
/** Below this many grams a day a split says nothing ("0 g and 0 g"), so it is not drawn. */
const MIN_SPLIT_G = 5;

type Targets = Partial<Record<'kcal' | 'protein_g' | 'carbs_g' | 'fat_g', number>>;
type Macro = 'protein' | 'carbs' | 'fat';
const MACROS: readonly (readonly [Macro, string, 'protein_g' | 'carbs_g' | 'fat_g'])[] = [
  ['protein', 'Protein', 'protein_g'],
  ['carbs', 'Carbs', 'carbs_g'],
  ['fat', 'Fat', 'fat_g'],
];

/** A measure is complete when it has a value and every counted entry had one. */
function complete(week: WeeklyAverage, key: string): number | null {
  const m = week.measures[key];
  return m && m.average !== null && m.covered === m.count ? m.average : null;
}

/**
 * A mouse shows the tooltip on hover; a finger or pen toggles it with a tap; the keyboard shows it on
 * focus. Each input does only its own job, so a click after a hover does not close it again.
 */
function useTip<T extends string>() {
  const [tip, setTip] = useState<T | null>(null);
  const clear = (k: T) => setTip((t) => (t === k ? null : t));
  const handlers = (k: T) => ({
    onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') setTip(k); },
    onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') clear(k); },
    onPointerUp: (e: React.PointerEvent) => { if (e.pointerType !== 'mouse') setTip((t) => (t === k ? null : k)); },
    onFocus: (e: React.FocusEvent) => { if ((e.target as Element).matches(':focus-visible')) setTip(k); },
    onBlur: () => clear(k),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Escape') clear(k); },
  });
  return [tip, handlers] as const;
}

function Tip({ children, style, testId }: { children: React.ReactNode; style: React.CSSProperties; testId: string }) {
  return (
    <div
      role="tooltip"
      data-testid={testId}
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-xl border border-strong bg-[#1F1F22] px-3 py-2 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.55)]"
      style={style}
    >
      {children}
    </div>
  );
}

export function MacroRing({ week, targets }: { week: WeeklyAverage; targets: Targets }) {
  const [tip, tipOn] = useTip<Macro>();
  const kcal = week.measures.kcal?.average ?? null;
  const kcalLower = !!week.measures.kcal && week.measures.kcal.covered < week.measures.kcal.count;
  const p = complete(week, 'protein_g');
  const c = complete(week, 'carbs_g');
  const f = complete(week, 'fat_g');
  const shares = p !== null && c !== null && f !== null ? sharesFromGrams({ protein_g: p, carbs_g: c, fat_g: f }) : null;

  // The ring: three arcs with a small gap between them, starting at the top.
  const SIZE = 156;
  const MID = SIZE / 2;
  const R = 60;
  const C = 2 * Math.PI * R;
  const GAP = shares ? 3 : 0;
  let offset = 0;
  const arcs = shares
    ? MACROS.filter(([k]) => shares[k] > 0).map(([k, label, key]) => {
        const len = Math.max(0, (shares[k] / 100) * C - GAP);
        // Where the tooltip goes: just outside the middle of the arc.
        const angle = ((offset + len / 2) / C) * 2 * Math.PI;
        const arc = { k, label, key, len, offset, tipX: MID + (R + 30) * Math.sin(angle), tipY: MID - (R + 30) * Math.cos(angle) };
        offset += (shares[k] / 100) * C;
        return arc;
      })
    : [];

  const gramsText = (key: 'protein_g' | 'carbs_g' | 'fat_g') => {
    const m = week.measures[key];
    if (!m || m.average === null) return '?';
    return `${m.covered < m.count ? '≥' : ''}${formatNumber(m.average, 0)} g`;
  };

  const sugars = complete(week, 'sugars_g');
  const sat = complete(week, 'sat_fat_g');
  const showSugars = sugars !== null && c !== null && c >= MIN_SPLIT_G;
  const showSat = sat !== null && f !== null && f >= MIN_SPLIT_G;

  return (
    <div data-testid="macro-ring">
      <div className="flex flex-col items-center">
        <div className="relative" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden={shares ? undefined : true} role={shares ? undefined : 'img'} aria-label={shares ? undefined : 'Not every entry has protein, carbs and fat, so the split is not shown'}>
            <circle cx={MID} cy={MID} r={R} fill="none" stroke="var(--color-border)" strokeWidth="16" />
            {arcs.map((a) => (
              <g key={a.k}>
                <circle
                  cx={MID}
                  cy={MID}
                  r={R}
                  fill="none"
                  stroke={MACRO_COLORS[a.k]}
                  strokeWidth={tip === a.k ? 20 : 16}
                  strokeDasharray={`${a.len} ${C - a.len}`}
                  strokeDashoffset={-a.offset}
                  transform={`rotate(-90 ${MID} ${MID})`}
                  style={{ transition: 'stroke-width 120ms' }}
                />
                {/* A wider, invisible band over the arc: easy to hover and to tap. */}
                <circle
                  cx={MID}
                  cy={MID}
                  r={R}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="30"
                  strokeDasharray={`${a.len} ${C - a.len}`}
                  strokeDashoffset={-a.offset}
                  transform={`rotate(-90 ${MID} ${MID})`}
                  className="cursor-pointer outline-none"
                  tabIndex={0}
                  role="button"
                  aria-label={`${a.label}: ${gramsText(a.key)} a day${targets[a.key] !== undefined ? ` of ${formatNumber(targets[a.key] as number, 0)} g` : ''}, ${shares?.[a.k]}% of calories`}
                  data-testid={`ring-seg-${a.k}`}
                  {...tipOn(a.k)}
                />
              </g>
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="num text-[30px] font-bold leading-none tracking-[-0.5px]" data-testid="ring-kcal">
              {kcal === null ? '?' : `${kcalLower ? '≥' : ''}${formatNumber(kcal, 0)}`}
            </span>
            <span className="num mt-1 text-[12px] text-secondary">{targets.kcal ? `/ ${formatNumber(targets.kcal, 0)} kcal` : 'kcal'}</span>
          </div>
          {arcs
            .filter((a) => a.k === tip)
            .map((a) => (
              <Tip key={a.k} testId={`ring-tip-${a.k}`} style={{ left: a.tipX, top: a.tipY }}>
                <div className="flex items-center gap-1.5 text-[12px] text-secondary">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: MACRO_COLORS[a.k] }} />
                  {a.label}
                </div>
                <div className="num mt-0.5 text-[18px] font-bold leading-tight">
                  {gramsText(a.key)}
                  {targets[a.key] !== undefined && <span className="text-[12px] font-medium text-secondary"> / {formatNumber(targets[a.key] as number, 0)}</span>}
                </div>
                <div className="num text-[12px] text-secondary">{shares?.[a.k]}% of kcal</div>
              </Tip>
            ))}
        </div>
        {/* The colour key: names only, the numbers are in the tooltips. */}
        <div className="mt-2 flex items-center gap-3.5 text-[12px] text-secondary" aria-hidden="true">
          {MACROS.map(([k, label]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: MACRO_COLORS[k] }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {showSugars || showSat ? (
        <div className="mt-4 flex flex-col gap-3">
          {/* Max, 2026-11-14: fast vs slow carbs, unhealthy vs healthy fat. The label term stays in the tooltip:
              fast = sugars, slow = the other carbs (mostly starch); unhealthy = saturated, healthy = the rest (unsaturated). */}
          {showSugars && <Split label="Carbs" part={Math.min(sugars as number, c as number)} whole={c as number} partName="Fast" partTerm="sugars" restName="Slow" restTerm="mostly starch" color={MACRO_COLORS.carbs} soft={SOFT.sugars} testId="split-sugars" />}
          {showSat && <Split label="Fat" part={Math.min(sat as number, f as number)} whole={f as number} partName="Unhealthy" partTerm="saturated" restName="Healthy" restTerm="unsaturated" color={MACRO_COLORS.fat} soft={SOFT.sat} testId="split-sat-fat" />}
        </div>
      ) : null}
    </div>
  );
}

/** One macro split in two (fast/slow carbs, unhealthy/healthy fat). Hover or tap a part for its grams. */
function Split({ label, part, whole, partName, partTerm, restName, restTerm, color, soft, testId }: {
  label: string; part: number; whole: number; partName: string; partTerm: string; restName: string; restTerm: string; color: string; soft: string; testId: string;
}) {
  const [tip, tipOn] = useTip<'part' | 'rest'>();
  const pct = Math.round((part / whole) * 100);
  const rest = whole - part;
  const segs = [
    { k: 'part' as const, name: `${partName} ${label.toLowerCase()}`, term: partTerm, grams: part, width: pct, bg: soft, center: pct / 2 },
    { k: 'rest' as const, name: `${restName} ${label.toLowerCase()}`, term: restTerm, grams: rest, width: 100 - pct, bg: color, center: pct + (100 - pct) / 2 },
  ];
  return (
    <div data-testid={testId}>
      <div className="flex items-center justify-between text-[12px] text-secondary">
        <span>{label}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: soft }} />
            {partName}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: color }} />
            {restName}
          </span>
        </span>
      </div>
      <div className="relative mt-1.5">
        <div className="flex h-3 overflow-hidden rounded-full bg-border">
          {segs.map((s) =>
            s.width > 0 ? (
              <button
                key={s.k}
                type="button"
                aria-label={`${s.name} (${s.term}): ${formatNumber(s.grams, 0)} g a day`}
                data-testid={`${testId}-${s.k}`}
                className="h-full cursor-pointer outline-none focus-visible:brightness-125"
                style={{ width: `${s.width}%`, background: s.bg }}
                {...tipOn(s.k)}
              />
            ) : null,
          )}
        </div>
        {segs
          .filter((s) => s.k === tip)
          .map((s) => (
            <Tip key={s.k} testId={`${testId}-tip`} style={{ left: `${Math.min(85, Math.max(15, s.center))}%`, top: -24 }}>
              <span className="font-semibold">{s.name}</span> <span className="num">{formatNumber(s.grams, 0)} g</span>
              <span className="text-secondary"> · {s.term}</span>
            </Tip>
          ))}
      </div>
    </div>
  );
}
