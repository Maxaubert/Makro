// Voice and typed logging, step 2 (decision 49): say or type what you ate, check what Makro found, log it.
// The line is split by rules and each food comes from the normal search (domain/voice.ts, data/voiceResolve.ts);
// no AI and no cost. Speech uses the browser's own recognition when it has one; typing always works.
// Nothing is saved until the user presses Log, and an item with no amount must get one first (rule 1:
// Makro never guesses a number). A food with no match goes to the custom-food screen (rule 5).
import { useEffect, useRef, useState } from 'react';
import { productSubtext, type Product } from '../data/products';
import type { ResolvedItem } from '../data/voiceResolve';
import { buildLogEntry, MEALS, parseQuantity, unitsFor, type Meal } from '../domain/entry';
import { formatNumber } from '../domain/format';
import { resolveGrams, type AmountUnit } from '../domain/grams';
import { browserTimeZone } from '../domain/localDate';
import { href, navigate, useApp, useAppState } from '../lib/hooks';
import { DesktopShell } from '../ui/desktop';
import { Chip, Header, Icon, Notice, Page } from '../ui/kit';
import { MEAL_LABEL, mealForNow } from './day';

type Lang = 'nb-NO' | 'en-US';
const LANG_KEY = 'makro.voice.lang';

interface Row {
  key: string;
  query: string;
  candidates: Product[];
  pick: number;
  qty: string;
  unit: AmountUnit | null;
}

// The Web Speech API is not in the TypeScript DOM types everywhere.
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type RecognitionCtor = new () => Recognition;
function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** The amount the user said, in a unit this product can be logged in; empty when it must be typed. */
function startAmount(item: ResolvedItem, product: Product | undefined): { qty: string; unit: AmountUnit | null } {
  if (!product) return { qty: '', unit: null };
  const units = unitsFor(product);
  const said = item.quantity === null ? null : Array.isArray(item.quantity) ? (item.quantity[0] + item.quantity[1]) / 2 : item.quantity;
  if (item.unit !== null && units.includes(item.unit) && said !== null) return { qty: String(said), unit: item.unit };
  // No amount, or a unit this food has no weight for ("2 pieces" of a food sold by weight): ask for it.
  return { qty: '', unit: units[0] };
}

function rowsFrom(items: ResolvedItem[]): Row[] {
  return items.map((item, i) => {
    const product = item.candidates[0];
    return { key: `${i}-${item.query}`, query: item.query, candidates: item.candidates, pick: 0, ...startAmount(item, product) };
  });
}

const unitName = (u: AmountUnit, p: Product): string =>
  u === 'g' ? 'g' : u === 'ml' ? 'ml' : u === 'portion' ? 'portion' : `${u === 'piece' ? 'piece' : 'serving'} (${formatNumber(p.serving_g, 0)} g)`;

export function Voice() {
  return (
    <Page>
      <Header title="Log by voice" back="/add" />
      <VoiceLog />
    </Page>
  );
}

export function DesktopVoice() {
  return (
    <DesktopShell active="add" title="Log by voice">
      <div className="max-w-[760px]">
        <VoiceLog />
      </div>
    </DesktopShell>
  );
}

function VoiceLog() {
  const app = useApp();
  const { products } = useAppState();
  const ready = products.status === 'ready';
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [meal, setMeal] = useState<Meal>(mealForNow());
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return localStorage.getItem(LANG_KEY) === 'en-US' ? 'en-US' : 'nb-NO';
    } catch {
      return 'nb-NO';
    }
  });
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const Ctor = typeof window === 'undefined' ? null : recognitionCtor();

  // Read the line again shortly after it changes; the rows follow the text.
  useEffect(() => {
    if (!ready) return;
    let live = true;
    const t = setTimeout(() => {
      app.db.voice(text).then(
        (items) => live && setRows(rowsFrom(items)),
        (e: unknown) => live && setProblem(e instanceof Error ? e.message : String(e)),
      );
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [text, ready, app]);

  function pickLang(l: Lang) {
    setLang(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      // Kept for this visit only.
    }
  }

  function toggleMic() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    const before = text.trim();
    r.onresult = (e) => {
      let said = '';
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
      setText(`${before}${before ? ' ' : ''}${said.trim()}`);
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setListening(false);
      if (e.error === 'not-allowed') setProblem('Makro may not use the microphone. Allow it in the browser, or type instead.');
    };
    rec.current = r;
    setProblem(null);
    setListening(true);
    r.start();
  }

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const loggable = rows.filter((r) => r.candidates.length > 0);
  const amountOf = (r: Row) => {
    const p = r.candidates[r.pick];
    const q = parseQuantity(r.qty);
    if (!p || q === null || r.unit === null) return null;
    const grams = resolveGrams({ quantity: q, unit: r.unit, serving_g: p.serving_g }).grams;
    return grams === null ? null : { product: p, quantity: q, unit: r.unit };
  };
  const allSet = loggable.length > 0 && loggable.every((r) => amountOf(r) !== null);

  async function logAll() {
    if (!allSet || !ready) return;
    setSaving(true);
    try {
      const tz = browserTimeZone();
      const saved_at = new Date();
      for (const r of loggable) {
        const a = amountOf(r);
        if (!a) continue;
        await app.db.saveLogEntry(
          buildLogEntry({ food: { kind: 'product', product: a.product, db_version: products.meta.db_version }, quantity: a.quantity, unit: a.unit, meal, at: saved_at, tz, saved_at }),
        );
      }
      await app.changed();
      navigate('/today');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-4">
      {!ready && <Notice>The food database is still loading.</Notice>}

      <section className="card p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-secondary">{Ctor ? 'Say or type what you ate' : 'Type what you ate'}</span>
          <div className="flex gap-1.5" role="group" aria-label="Language">
            {(['nb-NO', 'en-US'] as const).map((l) => (
              <Chip key={l} selected={lang === l} onClick={() => pickLang(l)}>
                {l === 'nb-NO' ? 'Norsk' : 'English'}
              </Chip>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-start gap-3">
          <textarea
            aria-label="What you ate"
            data-testid="voice-text"
            className="min-h-[88px] flex-1 resize-none rounded-[14px] bg-raised p-3 text-[16px] leading-snug outline-none placeholder:text-faint"
            placeholder={lang === 'nb-NO' ? 'to egg og 200 g kjøttdeig' : 'two eggs and 200 g minced beef'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {Ctor && (
            <button
              type="button"
              onClick={toggleMic}
              aria-pressed={listening}
              aria-label={listening ? 'Stop listening' : 'Start listening'}
              data-testid="voice-mic"
              className={`tap flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${listening ? 'animate-pulse bg-accent text-ground' : 'bg-accent-tint text-accent'}`}
            >
              <Icon name="mic" size={24} stroke={2} />
            </button>
          )}
        </div>
      </section>

      {problem && <Notice tone="error">{problem}</Notice>}

      {rows.length > 0 && (
        <section className="card overflow-hidden" aria-label="Foods found">
          {rows.map((r, i) => {
            const p = r.candidates[r.pick];
            return (
              <div key={r.key} className={`flex flex-wrap items-center gap-2.5 px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`} data-testid="voice-row">
                {p ? (
                  <>
                    <select
                      aria-label={`Food for "${r.query}"`}
                      className="min-w-0 flex-1 truncate rounded-[12px] bg-raised px-3 py-2.5 text-[15px] font-semibold outline-none"
                      value={r.pick}
                      onChange={(e) => {
                        const pick = Number(e.target.value);
                        const next = r.candidates[pick];
                        const units = unitsFor(next);
                        update(r.key, { pick, unit: r.unit && units.includes(r.unit) ? r.unit : units[0] });
                      }}
                    >
                      {r.candidates.map((c, j) => (
                        <option key={c.id} value={j}>
                          {c.name}
                          {productSubtext(c) ? ` · ${productSubtext(c)}` : ''}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`Amount of ${p.name}`}
                      inputMode="decimal"
                      placeholder="Amount"
                      className={`num w-20 rounded-[12px] bg-raised px-3 py-2.5 text-right text-[15px] outline-none ${parseQuantity(r.qty) === null ? 'ring-1 ring-accent-2' : ''}`}
                      value={r.qty}
                      onChange={(e) => update(r.key, { qty: e.target.value })}
                    />
                    <select
                      aria-label={`Unit for ${p.name}`}
                      className="rounded-[12px] bg-raised px-2.5 py-2.5 text-[14px] outline-none"
                      value={r.unit ?? ''}
                      onChange={(e) => update(r.key, { unit: e.target.value as AmountUnit })}
                    >
                      {unitsFor(p).map((u) => (
                        <option key={u} value={u}>
                          {unitName(u, p)}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <span className="min-w-0 flex-1 text-[15px]">
                    <span className="text-secondary">No match for</span> <b>{r.query}</b>{' '}
                    <a className="ml-1 font-semibold text-accent-2" href={`${href('custom')}?name=${encodeURIComponent(r.query)}`}>
                      Make it a custom food
                    </a>
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${p?.name ?? r.query}`}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  className="tap flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-secondary hover:bg-raised"
                >
                  <Icon name="minus" size={18} />
                </button>
              </div>
            );
          })}
        </section>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Meal">
            {MEALS.map((m) => (
              <Chip key={m} selected={meal === m} onClick={() => setMeal(m)}>
                {MEAL_LABEL[m]}
              </Chip>
            ))}
          </div>
          <button
            type="button"
            disabled={!allSet || saving}
            onClick={() => void logAll()}
            data-testid="voice-log"
            className="tap ml-auto flex h-12 items-center rounded-full bg-accent px-6 text-[15px] font-bold text-ground disabled:bg-border disabled:text-faint"
          >
            Log {loggable.length} {loggable.length === 1 ? 'food' : 'foods'}
          </button>
        </div>
      )}
      {rows.some((r) => r.candidates.length > 0 && amountOf(r) === null) && (
        <p className="text-[13px] text-secondary">Add an amount where it is empty. Makro never guesses an amount.</p>
      )}
    </div>
  );
}
