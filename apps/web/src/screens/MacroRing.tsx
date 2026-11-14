// The weekly average as a picture (Max, 2026-11-14): one ring split by where the calories come from
// (protein, carbs, fat), the average kcal in the middle, and two split bars: sugars in the carbs and
// saturated fat in the fat. The numbers sit in tooltips that follow the pointer: hover a part (or tap
// it, or focus it with the keyboard). A split shows only when every entry of the week has the value, so a missing number never
// makes a bar look smaller than it is (rule 2). The shares use sharesFromGrams
// (goals/macro_shares.json), so there is no new maths here.
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

/** Which part the tooltip is for, and the screen point it sits next to. */
type TipAt<T> = { k: T; x: number; y: number };

/**
 * A mouse shows the tooltip on hover and it follows the cursor; a finger or pen toggles it with a tap,
 * next to the tap; the keyboard shows it on focus, above the part. Each input does only its own job,
 * so a click after a hover does not close it again.
 */
function useTip<T extends string>() {
  const [tip, setTip] = useState<TipAt<T> | null>(null);
  const clear = (k: T) => setTip((t) => (t?.k === k ? null : t));
  const handlers = (k: T) => ({
    onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') setTip({ k, x: e.clientX, y: e.clientY }); },
    onPointerMove: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') setTip({ k, x: e.clientX, y: e.clientY }); },
    onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') clear(k); },
    onPointerUp: (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse') setTip((t) => (t?.k === k ? null : { k, x: e.clientX, y: e.clientY }));
    },
    onFocus: (e: React.FocusEvent) => {
      if (!(e.target as Element).matches(':focus-visible')) return;
      const r = (e.target as Element).getBoundingClientRect();
      setTip({ k, x: r.left + r.width / 2, y: r.top });
    },
    onBlur: () => clear(k),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Escape') clear(k); },
  });
  return [tip, handlers] as const;
}

/** Gap between the pointer and the tooltip, and the margin it keeps from the window edge. */
const TIP_GAP = 14;
const EDGE = 8;

/**
 * The tooltip card. It goes to document.body (so no card clips it) and sits above and right of the
 * pointer; near the window edge it flips to the other side.
 */
function Tip({ at, children, testId }: { at: { x: number; y: number }; children: React.ReactNode; testId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = at.x + TIP_GAP;
    if (left + w > window.innerWidth - EDGE) left = at.x - TIP_GAP - w;
    let top = at.y - TIP_GAP - h;
    if (top < EDGE) top = at.y + TIP_GAP + 6;
    el.style.left = `${Math.max(EDGE, left)}px`;
    el.style.top = `${Math.max(EDGE, top)}px`;
    el.style.visibility = 'visible';
  }, [at.x, at.y]);
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      data-testid={testId}
      className="pointer-events-none fixed z-50 min-w-[148px] whitespace-nowrap rounded-[14px] border border-[#2A2A2D] bg-[#18181A]/95 px-3.5 py-3 text-[13px] text-[#F4F4F5] shadow-[0_12px_32px_rgba(0,0,0,0.6)] backdrop-blur-md"
      style={{ left: 0, top: 0, visibility: 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** The top line of a tooltip: a colour dot and the name. */
function TipHead({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[12px] font-medium text-secondary">
      <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: color }} />
      {children}
    </div>
  );
}

/** A thin bar for "this much of that". */
function TipBar({ value, of, color }: { value: number; of: number; color: string }) {
  const pct = of > 0 ? Math.min(100, Math.max(0, (value / of) * 100)) : 0;
  return (
    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#2A2A2D]">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
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
        const arc = { k, label, key, len, offset };
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
                  strokeWidth={tip?.k === a.k ? 20 : 16}
                  strokeDasharray={`${a.len} ${C - a.len}`}
                  strokeDashoffset={-a.offset}
                  transform={`rotate(-90 ${MID} ${MID})`}
                  style={{ transition: 'stroke-width 120ms' }}
                />
                {/* A wider, invisible band over the arc, gap included, so the tooltip does not blink between arcs. */}
                <circle
                  cx={MID}
                  cy={MID}
                  r={R}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="30"
                  strokeDasharray={`${a.len + GAP} ${C - a.len - GAP}`}
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
          {tip &&
            arcs
              .filter((a) => a.k === tip.k)
              .map((a) => {
                const target = targets[a.key];
                const grams = week.measures[a.key]?.average ?? null;
                return (
                  <Tip key={a.k} at={tip} testId={`ring-tip-${a.k}`}>
                    <TipHead color={MACRO_COLORS[a.k]}>{a.label}</TipHead>
                    <div className="num mt-1 text-[22px] font-bold leading-none tracking-[-0.3px]">
                      {gramsText(a.key)}
                      {target !== undefined && <span className="text-[13px] font-medium text-secondary"> / {formatNumber(target, 0)} g</span>}
                    </div>
                    {target !== undefined && grams !== null && <TipBar value={grams} of={target} color={MACRO_COLORS[a.k]} />}
                    <div className="num mt-2 text-[12px] text-secondary">{shares?.[a.k]}% of calories</div>
                  </Tip>
                );
              })}
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
    { k: 'part' as const, name: `${partName} ${label.toLowerCase()}`, term: partTerm, grams: part, width: pct, bg: soft },
    { k: 'rest' as const, name: `${restName} ${label.toLowerCase()}`, term: restTerm, grams: rest, width: 100 - pct, bg: color },
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
        {tip &&
          segs
            .filter((s) => s.k === tip.k)
            .map((s) => (
              <Tip key={s.k} at={tip} testId={`${testId}-tip`}>
                <TipHead color={s.bg}>{s.name}</TipHead>
                <div className="num mt-1 text-[22px] font-bold leading-none tracking-[-0.3px]">
                  {formatNumber(s.grams, 0)} g
                  <span className="text-[13px] font-medium text-secondary"> of {formatNumber(whole, 0)} g</span>
                </div>
                <TipBar value={s.grams} of={whole} color={s.bg} />
                <div className="mt-2 text-[12px] text-secondary">
                  {s.term.charAt(0).toUpperCase() + s.term.slice(1)} · <span className="num">{s.k === 'part' ? pct : 100 - pct}%</span>
                </div>
              </Tip>
            ))}
      </div>
    </div>
  );
}
