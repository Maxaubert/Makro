// Weight: add a weight and see a simple list. The bar chart comes later.
import { useState, type FormEvent } from 'react';
import { buildWeightEntry, parseAmount } from '../domain/entry';
import { formatNumber } from '../domain/format';
import { browserTimeZone } from '../domain/localDate';
import { useApp, useData } from '../lib/hooks';
import { Card, Notice, Page, PrimaryButton } from '../ui/kit';
import { dayLabel } from './day';

export function Weight() {
  const app = useApp();
  const { data: weights } = useData(() => app.db.weights(60), []);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const latest = weights?.[0];

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const kg = parseAmount(value);
      if (kg === null) return;
      await app.db.saveWeight(buildWeightEntry({ weight_kg: kg, at: new Date(), tz: browserTimeZone() }));
      await app.changed();
      setValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Page nav>
      <header className="pt-2">
        <h1 className="text-[28px] font-bold tracking-[-0.02em]">Weight</h1>
      </header>

      <Card className="mt-4 p-4">
        <div className="text-[13px] text-secondary">Latest</div>
        <div className="num text-[40px] font-bold leading-tight tracking-[-0.03em]">
          {latest ? formatNumber(latest.weight_kg, 1) : '-'}
          <span className="text-lg font-medium text-secondary"> kg</span>
        </div>
        {latest && <div className="text-[13px] text-secondary">{dayLabel(latest.local_date)}</div>}
      </Card>

      <form onSubmit={add} className="mt-3 flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[13px] text-secondary">Today's weight (kg)</span>
          <input className="field num" inputMode="decimal" placeholder="81.5" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <div className="w-36">
          <PrimaryButton type="submit" disabled={!value.trim()}>Log weight</PrimaryButton>
        </div>
      </form>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}

      {weights && weights.length > 0 && (
        <ul className="mt-5 overflow-hidden rounded-2xl border border-border bg-card" aria-label="Weights">
          {weights.map((w, i) => (
            <li key={w.id} className={`flex items-baseline justify-between px-4 py-3.5 ${i > 0 ? 'border-t border-border' : ''}`}>
              <span className="text-[15px]">{dayLabel(w.local_date)}</span>
              <span className="num text-[17px] font-bold">
                {formatNumber(w.weight_kg, 1)} <span className="text-[13px] font-medium text-secondary">kg</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {weights && weights.length === 0 && <p className="mt-6 text-center text-sm text-secondary">No weights yet.</p>}
    </Page>
  );
}
