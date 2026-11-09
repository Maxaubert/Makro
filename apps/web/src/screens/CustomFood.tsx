// Custom food: name, brand, barcode, per-100 values from the label (empty = unknown, never 0),
// unit g or ml. Saving creates the custom_foods row locally and records an anonymous miss
// through submit-miss with the v1 payload. Then straight to the portion screen.
import { useState, type FormEvent } from 'react';
import { buildCustomFood, type CustomFoodForm } from '../domain/entry';
import type { Nutrient } from '../domain/nutrients';
import { navigate, useApp, useQueryParam } from '../lib/hooks';
import { Card, Chip, Header, Notice, Page, PrimaryButton } from '../ui/kit';
import { withDay } from './day';

const MAIN: { key: Nutrient; label: string; unit: string }[] = [
  { key: 'kcal', label: 'Calories', unit: 'kcal' },
  { key: 'protein_g', label: 'Protein', unit: 'g' },
  { key: 'carbs_g', label: 'Carbs', unit: 'g' },
  { key: 'fat_g', label: 'Fat', unit: 'g' },
];
const MORE: { key: Nutrient; label: string; unit: string }[] = [
  { key: 'sat_fat_g', label: 'of which saturated', unit: 'g' },
  { key: 'sugars_g', label: 'of which sugars', unit: 'g' },
  { key: 'fibre_g', label: 'Fibre', unit: 'g' },
  { key: 'salt_g', label: 'Salt', unit: 'g' },
];

export function CustomFood() {
  const app = useApp();
  const query = useQueryParam('q');
  const day = useQueryParam('date');
  const [form, setForm] = useState<CustomFoodForm>({
    name: useQueryParam('name') ?? '',
    brand: useQueryParam('brand') ?? '',
    ean: useQueryParam('ean') ?? '',
    serving_g: '',
    per_100_unit: 'g',
    nutrients: {},
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<CustomFoodForm>) => setForm((f) => ({ ...f, ...patch }));
  const setN = (k: Nutrient, v: string) => setForm((f) => ({ ...f, nutrients: { ...f.nutrients, [k]: v } }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const food = buildCustomFood(form, new Date());
      await app.db.saveCustomFood(food);
      await app.changed();
      // The miss never blocks logging: it is queued and sent when there is a connection.
      void app.recordMiss(food, {
        type: food.ean ? 'scan_not_found' : 'search_no_match',
        ean: food.ean,
        query_text: food.ean ? null : query?.trim() || food.name,
      });
      navigate(withDay(`/portion/custom/${encodeURIComponent(food.id)}`, day), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  const numberField = (n: { key: Nutrient; label: string; unit: string }) => (
    <label key={n.key} className="flex items-center justify-between gap-3 border-t border-border py-2.5 first:border-t-0">
      <span className="text-[15px]">{n.label}</span>
      <span className="flex items-baseline gap-1.5">
        <input
          className="num w-24 rounded-xl border border-border bg-ground px-3 py-2 text-right text-[16px] outline-none placeholder:text-[#6A6A70] focus:border-accent-2"
          inputMode="decimal"
          placeholder="?"
          aria-label={`${n.label} per 100 ${form.per_100_unit}`}
          value={form.nutrients[n.key] ?? ''}
          onChange={(e) => setN(n.key, e.target.value)}
        />
        <span className="w-8 text-[13px] text-secondary">{n.unit}</span>
      </span>
    </label>
  );

  return (
    <Page>
      <Header title="Custom food" back="/add" />
      <form onSubmit={save} className="flex flex-1 flex-col">
        <Card className="mt-3 flex flex-col gap-3 p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-secondary">Name</span>
            <input className="field" required value={form.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!form.name} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-secondary">Brand (optional)</span>
              <input className="field" value={form.brand} onChange={(e) => set({ brand: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-secondary">Barcode (optional)</span>
              <input className="field num" inputMode="numeric" value={form.ean} onChange={(e) => set({ ean: e.target.value.replace(/\D/g, '') })} />
            </label>
          </div>
        </Card>

        <Card className="mt-3 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-secondary">Per 100 {form.per_100_unit}, from the label</span>
            <span className="flex gap-1.5">
              <Chip selected={form.per_100_unit === 'g'} onClick={() => set({ per_100_unit: 'g' })}>g</Chip>
              <Chip selected={form.per_100_unit === 'ml'} onClick={() => set({ per_100_unit: 'ml' })}>ml</Chip>
            </span>
          </div>
          <div className="mt-2">{MAIN.map(numberField)}</div>
          <details className="mt-1">
            <summary className="tap cursor-pointer py-2 text-sm font-semibold text-accent-2">More nutrients</summary>
            {MORE.map(numberField)}
          </details>
          <p className="mt-1 text-[12px] text-secondary">Leave a field empty if the label does not say. Empty means unknown, not 0.</p>
        </Card>

        <label className="card mt-3 flex items-center justify-between px-4 py-2.5">
          <span className="text-[15px]">Serving size (optional)</span>
          <span className="flex items-baseline gap-1.5">
            <input
              className="num w-24 rounded-xl border border-border bg-ground px-3 py-2 text-right text-[16px] outline-none focus:border-accent-2"
              inputMode="decimal"
              value={form.serving_g}
              onChange={(e) => set({ serving_g: e.target.value })}
            />
            <span className="w-8 text-[13px] text-secondary">g</span>
          </span>
        </label>

        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-auto pt-6">
          <PrimaryButton type="submit" disabled={saving || !form.name.trim()}>Save and choose portion</PrimaryButton>
        </div>
      </form>
    </Page>
  );
}
