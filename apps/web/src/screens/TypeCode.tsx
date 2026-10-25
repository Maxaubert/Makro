// Type the code: browsers on iPhone cannot scan, so the barcode is typed. The lookup uses the
// canonical form of products-db.md (EAN-8 and UPC-A padded, GTIN-14 with a leading 0 trimmed).
// Not found becomes a custom food straight away (rule 5).
import { useEffect, useState, type FormEvent } from 'react';
import { canonicalEan } from '../data/barcode';
import { href, navigate, useApp, useAppState } from '../lib/hooks';
import { Header, Icon, Notice, Page, PrimaryButton, SecondaryButton } from '../ui/kit';

function grouped(code: string): string {
  if (code.length === 13) return `${code.slice(0, 1)} ${code.slice(1, 7)} ${code.slice(7)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  return code;
}

export function TypeCode() {
  const app = useApp();
  const { products } = useAppState();
  const [code, setCode] = useState('');
  const [missing, setMissing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid = canonicalEan(code) !== null && code.length >= 8;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (/^\d$/.test(e.key)) setCode((c) => (c.length < 14 ? c + e.key : c));
      if (e.key === 'Backspace') setCode((c) => c.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function find(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    if (products.status !== 'ready') {
      setError('The food database is still loading. Try again in a moment.');
      return;
    }
    try {
      const p = await app.db.barcode(code);
      if (p) navigate(`/portion/product/${encodeURIComponent(p.id)}`);
      else setMissing(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (missing) {
    return (
      <Page>
        <Header title="" back="/add" />
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="flex h-24 w-24 items-center justify-center rounded-full border border-border bg-card text-secondary">
            <Icon name="noBarcode" size={52} stroke={1.6} />
          </span>
          <h2 className="mt-5 text-2xl font-bold">Not in the database</h2>
          <div className="num mt-1 tracking-[0.08em] text-secondary">{grouped(canonicalEan(missing) ?? missing)}</div>
        </div>
        <div className="flex flex-col gap-2">
          <PrimaryButton onClick={() => navigate(`/custom?ean=${encodeURIComponent(canonicalEan(missing) ?? '')}`)}>Add custom food</PrimaryButton>
          <SecondaryButton
            onClick={() => {
              setMissing(null);
              setCode('');
            }}
          >
            Try another code
          </SecondaryButton>
        </div>
      </Page>
    );
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return (
    <Page>
      <Header title="Type the code" back="/add" />
      <form onSubmit={find} className="flex flex-1 flex-col">
        <label htmlFor="code" className="sr-only">Barcode</label>
        <input
          id="code"
          className="card num mt-6 h-24 w-full bg-card text-center text-[32px] font-bold tracking-[0.08em] outline-none placeholder:text-[#6A6A70] focus:border-accent-2"
          inputMode="numeric"
          placeholder="Barcode"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 14))}
        />
        <div className="mt-5 grid grid-cols-3 gap-2">
          {keys.map((k, i) =>
            k === '' ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                type="button"
                aria-label={k === 'del' ? 'Delete digit' : k}
                onClick={() => setCode((c) => (k === 'del' ? c.slice(0, -1) : c.length < 14 ? c + k : c))}
                className="tap flex h-16 items-center justify-center rounded-[20px] border border-border bg-card text-[26px] font-semibold"
              >
                {k === 'del' ? <Icon name="erase" /> : k}
              </button>
            ),
          )}
        </div>
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-auto pt-6">
          <PrimaryButton type="submit" disabled={!valid}>Find product</PrimaryButton>
          <a href={href('add')} className="mt-2 flex h-11 items-center justify-center text-sm font-semibold text-accent-2">Search by name instead</a>
        </div>
      </form>
    </Page>
  );
}
