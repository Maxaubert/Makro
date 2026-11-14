// The weekly average as a radar (Max, 2026-11-14, mockup "02 Radar + tiles"): one triangle with a corner
// each for protein, carbs and fat, each measured against its own target. A hairline triangle is 100% of
// the targets, so short and over show at a glance. The average kcal sits on top and the grams in three
// tiles below. No hover or tooltips: every number is always on screen.
// The radar needs all three averages complete (every entry had the value) and all three targets, so a
// missing number never draws a corner shorter than it is (rule 2). Otherwise only the tiles show.
// The file keeps its name and test ids (macro-ring, ring-kcal) so callers and tests stay stable.
import { useEffect, useState } from 'react';
import type { WeeklyAverage } from '../domain/guidance';
import { formatNumber } from '../domain/format';

export const MACRO_COLORS = { protein: '#FF4C00', carbs: '#FF8A57', fat: '#FFB38F' } as const;

type Targets = Partial<Record<'kcal' | 'protein_g' | 'carbs_g' | 'fat_g', number>>;
type Macro = 'protein' | 'carbs' | 'fat';
type Key = 'protein_g' | 'carbs_g' | 'fat_g';
const MACROS: readonly (readonly [Macro, string, Key])[] = [
  ['protein', 'Protein', 'protein_g'],
  ['carbs', 'Carbs', 'carbs_g'],
  ['fat', 'Fat', 'fat_g'],
];

/** The radar's outer edge, as a share of the target. Further out is drawn at the edge. */
const EDGE = 1.2;
/** Above this share of the target, the percent turns orange. A display hint only. */
const OVER = 1.05;

/** A measure is complete when it has a value and every counted entry had one. */
function complete(week: WeeklyAverage, key: string): number | null {
  const m = week.measures[key];
  return m && m.average !== null && m.covered === m.count ? m.average : null;
}

/** 0 to 1 over 800 ms after mount, eased out. Straight to 1 when the user asks for less motion. */
function useGrow(): number {
  const [t, setT] = useState(() => (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 1 : 0));
  useEffect(() => {
    if (t === 1) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const x = Math.min(1, (now - t0) / 800);
      setT(1 - Math.pow(1 - x, 4));
      if (x < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // Runs once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return t;
}

// Geometry: a 300 x 188 box, the triangle's centre at (150, 120), corners up, lower right, lower left.
const W = 300;
const H = 188;
const CX = 150;
const CY = 120;
const R = 84;
const ang = (i: number) => (i / 3) * Math.PI * 2;
const pt = (i: number, share: number): [number, number] => [CX + R * (share / EDGE) * Math.sin(ang(i)), CY - R * (share / EDGE) * Math.cos(ang(i))];
const path = (shares: number[]) => 'M' + shares.map((s, i) => pt(i, s).map((n) => n.toFixed(2)).join(' ')).join('L') + 'Z';

export function MacroRing({ week, targets }: { week: WeeklyAverage; targets: Targets }) {
  const grow = useGrow();
  const kcal = week.measures.kcal?.average ?? null;
  const kcalLower = !!week.measures.kcal && week.measures.kcal.covered < week.measures.kcal.count;
  // Only a complete average gets a share, so a lower bound never shows as a smaller bar (rule 2).
  const kcalComplete = complete(week, 'kcal');
  const kcalShare = kcalComplete !== null && targets.kcal ? kcalComplete / targets.kcal : null;

  const axes = MACROS.map(([k, label, key]) => {
    const grams = complete(week, key);
    const target = targets[key];
    const share = grams !== null && target ? grams / target : null;
    return { k, label, key, share };
  });
  const drawable = axes.every((a) => a.share !== null);

  const gramsText = (key: Key) => {
    const m = week.measures[key];
    if (!m || m.average === null) return '?';
    return `${m.covered < m.count ? '≥' : ''}${formatNumber(m.average, 0)}`;
  };
  const pct = (share: number) => formatNumber(share * 100, 0);

  return (
    <div data-testid="macro-ring">
      {/* Mockup "01 Big number on top" (Max, 2026-11-14): the calories big, the share of the target on the right, a thin bar. */}
      <div className="flex items-baseline gap-2 whitespace-nowrap">
        <span className="num text-[40px] font-bold leading-none tracking-[-1px]" data-testid="ring-kcal">
          {kcal === null ? '?' : `${kcalLower ? '≥' : ''}${formatNumber(kcal, 0)}`}
        </span>
        <span className="num text-[14px] text-secondary">{targets.kcal ? `/ ${formatNumber(targets.kcal, 0)} kcal` : 'kcal'}</span>
        {kcalShare !== null && <span className="num ml-auto text-[13px] text-secondary">{formatNumber(kcalShare * 100, 0)}%</span>}
      </div>
      {targets.kcal ? (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-[3px] bg-strong" role="img" aria-label={kcalShare === null ? 'Calorie target progress unknown' : `${formatNumber(kcalShare * 100, 0)}% of the calorie target`} data-testid="ring-kcal-bar">
          {kcalShare !== null && <div className="h-full rounded-[3px] bg-accent" style={{ width: `${Math.min(100, kcalShare * 100)}%` }} />}
        </div>
      ) : null}

      {drawable ? (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mx-auto mt-[22px] block w-full max-w-[300px]"
          role="img"
          aria-label={`Share of target: ${axes.map((a) => `${a.label} ${pct(a.share as number)}%`).join(', ')}`}
          data-testid="macro-radar"
        >
          <defs>
            <linearGradient id="radar-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.42" />
              <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          {axes.map((_, i) => {
            const [x, y] = pt(i, 1);
            return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="#fff" strokeOpacity="0.05" />;
          })}
          {/* 100% of each target. */}
          <path d={path([1, 1, 1])} fill="#fff" fillOpacity="0.025" stroke="#fff" strokeOpacity="0.16" strokeLinejoin="round" />
          <path
            d={path(axes.map((a) => Math.max(0.001, Math.min(a.share as number, EDGE) * grow)))}
            fill="url(#radar-fill)"
            stroke="var(--color-accent)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {axes.map((a, i) => {
            const [x, y] = pt(i, Math.max(0.001, Math.min(a.share as number, EDGE) * grow));
            return <circle key={a.k} cx={x} cy={y} r="3" fill={MACRO_COLORS[a.k]} stroke="var(--color-card)" strokeWidth="1.5" opacity={grow} />;
          })}
          {axes.map((a, i) => {
            // The label sits above the top corner and beside the two lower ones.
            const [x, y] = pt(i, EDGE);
            const top = i === 0;
            const right = Math.sin(ang(i)) > 0;
            const tx = top ? x : x + (right ? 12 : -12);
            const ny = top ? y - 28 : y - 3;
            const anchor = top ? 'middle' : right ? 'start' : 'end';
            const share = a.share as number;
            return (
              <g key={a.k} data-testid={`radar-${a.k}`}>
                <text x={tx} y={ny} textAnchor={anchor} fontSize="11" fill="var(--color-text-secondary)" letterSpacing="0.02em">
                  <tspan fill={MACRO_COLORS[a.k]}>●</tspan> {a.label}
                </text>
                <text x={tx} y={ny + 17} textAnchor={anchor} fontSize="15" fontWeight="600" fill={share > OVER ? 'var(--color-accent-2)' : 'var(--color-text)'} className="num">
                  {pct(share)}%
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <p className="mt-2 text-[13px] text-secondary" data-testid="radar-missing">
          {week.counted_days === 0 && week.skipped.length > 0
            ? 'No day is counted. Tap a striped bar to count that day.'
            : 'The shape needs a target and a full week of protein, carbs and fat.'}
        </p>
      )}

      {/* Same grey boxes as the macro boxes on desktop Today (Max, 2026-11-14). */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {axes.map((a) => (
          <div key={a.k} className="rounded-[14px] bg-raised px-1.5 pb-[9px] pt-2.5 text-center" data-testid={`tile-${a.k}`}>
            <div className="num text-[18px] font-bold">
              {gramsText(a.key)}
              <span className="ml-px text-[12px] font-medium text-secondary">g</span>
            </div>
            <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[12px] text-secondary">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: MACRO_COLORS[a.k] }} />
              {a.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
