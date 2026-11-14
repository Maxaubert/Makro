// The weekly average as a picture (Max, 2026-11-14): one ring split by where the calories come from
// (protein, carbs, fat), the average kcal in the middle, and two split bars: sugars in the carbs and
// saturated fat in the fat. A split shows only when every entry of the week has the value, so a
// missing number never makes a bar look smaller than it is (rule 2). The shares use sharesFromGrams
// (goals/macro_shares.json), so there is no new maths here.
import type { WeeklyAverage } from '../domain/guidance';
import { sharesFromGrams } from '../domain/goals';
import { formatNumber } from '../domain/format';

export const MACRO_COLORS = { protein: '#FF4C00', carbs: '#FF8A57', fat: '#FFB38F' } as const;
const SOFT = { sugars: '#FFD2BC', sat: '#FFE3D4' } as const;
/** Below this many grams a day a split says nothing ("0 g and 0 g"), so it is not drawn. */
const MIN_SPLIT_G = 5;

type Targets = Partial<Record<'kcal' | 'protein_g' | 'carbs_g' | 'fat_g', number>>;

/** A measure is complete when it has a value and every counted entry had one. */
function complete(week: WeeklyAverage, key: string): number | null {
  const m = week.measures[key];
  return m && m.average !== null && m.covered === m.count ? m.average : null;
}

export function MacroRing({ week, targets }: { week: WeeklyAverage; targets: Targets }) {
  const kcal = week.measures.kcal?.average ?? null;
  const kcalLower = !!week.measures.kcal && week.measures.kcal.covered < week.measures.kcal.count;
  const p = complete(week, 'protein_g');
  const c = complete(week, 'carbs_g');
  const f = complete(week, 'fat_g');
  const shares = p !== null && c !== null && f !== null ? sharesFromGrams({ protein_g: p, carbs_g: c, fat_g: f }) : null;

  // The ring: three arcs with a small gap between them, starting at the top.
  const R = 52;
  const C = 2 * Math.PI * R;
  const GAP = shares ? 3 : 0;
  let offset = 0;
  const arcs = shares
    ? (['protein', 'carbs', 'fat'] as const)
        .filter((k) => shares[k] > 0)
        .map((k) => {
          const len = Math.max(0, (shares[k] / 100) * C - GAP);
          const arc = { k, len, offset };
          offset += (shares[k] / 100) * C;
          return arc;
        })
    : [];
  const ringLabel = shares
    ? `Calories from protein ${shares.protein}%, carbs ${shares.carbs}%, fat ${shares.fat}%`
    : 'Not every entry has protein, carbs and fat, so the split is not shown';

  const sugars = complete(week, 'sugars_g');
  const sat = complete(week, 'sat_fat_g');

  return (
    <div data-testid="macro-ring">
      {/* Ring on top, the three macros in columns under it: fits a narrow side panel and a phone alike. */}
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-[132px] w-[132px] shrink-0">
          <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={ringLabel}>
            <circle cx="66" cy="66" r={R} fill="none" stroke="var(--color-border)" strokeWidth="14" />
            {arcs.map((a) => (
              <circle
                key={a.k}
                cx="66"
                cy="66"
                r={R}
                fill="none"
                stroke={MACRO_COLORS[a.k]}
                strokeWidth="14"
                strokeDasharray={`${a.len} ${C - a.len}`}
                strokeDashoffset={-a.offset}
                transform="rotate(-90 66 66)"
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="num text-[26px] font-bold leading-none tracking-[-0.5px]" data-testid="ring-kcal">
              {kcal === null ? '?' : `${kcalLower ? '≥' : ''}${formatNumber(kcal, 0)}`}
            </span>
            <span className="num mt-1 text-[12px] text-secondary">{targets.kcal ? `/ ${formatNumber(targets.kcal, 0)} kcal` : 'kcal'}</span>
          </div>
        </div>
        <div className="grid w-full grid-cols-3 gap-2">
          {(
            [
              ['protein', 'Protein', 'protein_g'],
              ['carbs', 'Carbs', 'carbs_g'],
              ['fat', 'Fat', 'fat_g'],
            ] as const
          ).map(([k, label, key]) => {
            const m = week.measures[key];
            const avg = m?.average ?? null;
            const target = targets[key];
            return (
              <div key={k} className="min-w-0 text-center" data-testid={`ring-${k}`}>
                <div className="flex items-center justify-center gap-1.5 text-[12px] text-secondary">
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: MACRO_COLORS[k] }} />
                  {label}
                </div>
                <div className="num mt-0.5 whitespace-nowrap text-[22px] font-bold leading-tight">
                  {avg === null ? '?' : `${m && m.covered < m.count ? '≥' : ''}${formatNumber(avg, 0)}`}
                  <span className="text-[13px] font-medium text-secondary"> g</span>
                </div>
                <div className="num whitespace-nowrap text-[12px] text-secondary">
                  {target !== undefined && `/ ${formatNumber(target, 0)}`}
                  {target !== undefined && shares && ' · '}
                  {shares && `${shares[k]}%`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(sugars !== null && c !== null && c >= MIN_SPLIT_G) || (sat !== null && f !== null && f >= MIN_SPLIT_G) ? (
        <div className="mt-4 flex flex-col gap-3">
          {sugars !== null && c !== null && c >= MIN_SPLIT_G && <Split label="Carbs" part={Math.min(sugars, c)} whole={c} partName="Sugars" color={MACRO_COLORS.carbs} soft={SOFT.sugars} testId="split-sugars" />}
          {sat !== null && f !== null && f >= MIN_SPLIT_G && <Split label="Fat" part={Math.min(sat, f)} whole={f} partName="Saturated" color={MACRO_COLORS.fat} soft={SOFT.sat} testId="split-sat-fat" />}
        </div>
      ) : null}
    </div>
  );
}

/** One macro split in two: the named part (sugars, saturated) and the rest. */
function Split({ label, part, whole, partName, color, soft, testId }: { label: string; part: number; whole: number; partName: string; color: string; soft: string; testId: string }) {
  const pct = Math.round((part / whole) * 100);
  const rest = whole - part;
  return (
    <div data-testid={testId} role="img" aria-label={`${label}: ${partName.toLowerCase()} ${formatNumber(part, 0)} g, other ${formatNumber(rest, 0)} g a day`}>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-secondary">{label}</span>
        <span className="num">
          <span className="font-bold">{partName} {formatNumber(part, 0)} g</span>
          <span className="text-secondary"> · other {formatNumber(rest, 0)} g</span>
        </span>
      </div>
      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-border">
        <div style={{ width: `${pct}%`, background: soft }} />
        <div style={{ width: `${100 - pct}%`, background: color }} />
      </div>
    </div>
  );
}
