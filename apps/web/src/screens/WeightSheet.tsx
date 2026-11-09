// The bottom sheet for logging or editing a weight (canvas board B_LogWeight).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { buildWeightEntry, parseAmount, type WeightEntryRow } from '../domain/entry';
import { browserTimeZone, localDateIn } from '../domain/localDate';
import { roundForDisplay } from '../domain/display';
import { isPlausibleWeight } from '../domain/weight';
import { WEIGHT_RANGE_KG } from '../domain/goals';
import { useApp } from '../lib/hooks';
import { Icon, Notice } from '../ui/kit';
import { today } from './day';

const pad = (n: number) => String(n).padStart(2, '0');

/** The value format of datetime-local, in the browser's own zone. */
function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function whenLabel(at: Date | null): string {
  if (!at) return 'Pick a time';
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  if (localDateIn(at, browserTimeZone()) === today()) return `Today, ${time}`;
  return `${at.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')}, ${time}`;
}

function parseKg(text: string): number | null {
  try {
    const n = parseAmount(text);
    return n !== null && isPlausibleWeight(n) ? n : null;
  } catch {
    return null;
  }
}

/** The dimmed backdrop and the sheet itself. Escape or a tap outside closes it. */
export function Sheet({ labelId, onClose, children }: { labelId: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-30">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/[0.62]" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[440px] rounded-t-[28px] border-t border-border bg-card px-4 pb-[max(env(safe-area-inset-bottom),36px)] pt-2.5 outline-none"
      >
        <div className="mx-auto h-1 w-10 rounded-sm bg-[#3A3A3E]" />
        {children}
      </div>
    </div>
  );
}

function Stepper({ label, icon, disabled, onClick }: { label: string; icon: 'plus' | 'minus'; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="tap flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-border bg-raised disabled:text-[#6A6A70]"
    >
      {icon === 'plus' ? (
        <Icon name="plus" stroke={2.2} />
      ) : (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      )}
    </button>
  );
}

export function WeightSheet({ entry, suggestedKg, onClose }: { entry: WeightEntryRow | null; suggestedKg: number | null; onClose: () => void }) {
  const app = useApp();
  const [text, setText] = useState(() => {
    if (entry) return Number.isInteger(entry.weight_kg) ? entry.weight_kg.toFixed(1) : String(entry.weight_kg);
    return suggestedKg === null ? '' : (roundForDisplay(suggestedKg, 1) as number).toFixed(1);
  });
  const [when, setWhen] = useState(() => toLocalInput(entry ? new Date(entry.measured_at) : new Date()));
  const [whenChanged, setWhenChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kg = parseKg(text);
  const parsedAt = when ? new Date(when) : null;
  const at = parsedAt && !Number.isNaN(parsedAt.getTime()) ? parsedAt : null;
  const inFuture = at !== null && at.getTime() > Date.now();
  const invalid = text.trim() !== '' && kg === null;
  const canSave = kg !== null && at !== null && !inFuture && !saving;

  function step(delta: number) {
    if (kg === null) return;
    const next = roundForDisplay(kg + delta, 1) as number;
    if (isPlausibleWeight(next)) setText(next.toFixed(1));
  }

  async function run(action: () => Promise<void>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      await app.changed();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  function save() {
    if (kg === null || at === null) return;
    const tz = browserTimeZone();
    const moved = whenChanged ? { at, tz } : undefined;
    return run(async () => {
      if (entry) {
        await app.db.updateWeight(entry.id, { ...(kg !== entry.weight_kg ? { weight_kg: kg } : {}), ...(moved ? { moved } : {}) });
      } else {
        const now = new Date();
        await app.db.saveWeight(buildWeightEntry({ weight_kg: kg, at: moved ? at : now, tz, now }));
      }
    });
  }

  function remove() {
    if (entry) return run(() => app.db.tombstone('weight_entries', entry.id));
  }

  return (
    <Sheet labelId="weight-sheet-title" onClose={onClose}>
      <div className="mt-3.5 flex items-center justify-between">
        <h2 id="weight-sheet-title" className="text-xl font-bold">
          {entry ? 'Edit weight' : 'Log weight'}
        </h2>
        <span className="relative flex h-[34px] items-center rounded-full border border-border bg-raised px-3.5 text-[13px] font-semibold focus-within:border-accent-2">
          {whenLabel(at)}
          <input
            type="datetime-local"
            aria-label="Date and time"
            value={when}
            max={toLocalInput(new Date())}
            onChange={(e) => {
              setWhen(e.target.value);
              setWhenChanged(true);
            }}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker();
              } catch {
                // Not every browser has showPicker; the field still works by typing.
              }
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </span>
      </div>

      <div className="mt-[22px] flex items-center justify-between gap-2">
        <Stepper label="Minus 0.1 kg" icon="minus" disabled={kg === null} onClick={() => step(-0.1)} />
        <div className="min-w-0 flex-1 text-center">
          <input
            aria-label="Weight in kg"
            inputMode="decimal"
            placeholder="--.-"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="mx-auto block w-[190px] max-w-full border-b-2 border-accent bg-transparent pb-0.5 text-center text-[72px] font-bold leading-none tracking-[-2.5px] outline-none placeholder:text-[#3A3A3E]"
          />
          <div className="mt-1.5 text-base text-secondary">kg</div>
        </div>
        <Stepper label="Plus 0.1 kg" icon="plus" disabled={kg === null} onClick={() => step(0.1)} />
      </div>

      <div role="status" className={`mt-2.5 text-center text-[13px] ${invalid ? 'text-accent-2' : 'text-secondary'}`}>
        {invalid ? `Enter a weight between ${WEIGHT_RANGE_KG.min} and ${WEIGHT_RANGE_KG.max} kg` : 'Type the number or use the steps'}
      </div>

      {inFuture && (
        <div className="mt-4">
          <Notice>A weight can't be in the future.</Notice>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {entry && (
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-ground px-4 py-3 text-sm">
          <span>Source</span>
          <span className="text-secondary">{entry.source === 'apple_health' ? 'Apple Health' : 'Added by you'}</span>
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onClose} className="tap flex h-14 shrink-0 items-center rounded-full border border-border bg-raised px-[22px] text-[15px] font-semibold">
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="tap flex h-14 flex-1 items-center justify-center rounded-full bg-accent text-base font-bold text-ground disabled:border disabled:border-border disabled:bg-raised disabled:text-[#6A6A70]"
        >
          {entry ? 'Save changes' : 'Save weight'}
        </button>
      </div>
      {entry && (
        <button type="button" onClick={remove} disabled={saving} className="tap mt-2 h-12 w-full rounded-full text-[15px] font-semibold text-[#FF6B3D]">
          Delete entry
        </button>
      )}
    </Sheet>
  );
}
