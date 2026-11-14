// Type the code: the way in where a browser cannot scan (iPhone), and the fallback on the scanner.
// The lookup uses the canonical form of products-db.md (EAN-8 and UPC-A padded, GTIN-14 with a
// leading 0 trimmed) and the same result screens as the camera.
import { useEffect, useState, type FormEvent } from 'react';
import { BARCODE_LENGTHS, canonicalEan } from '../data/barcode';
import { barcodeDestination } from '../data/barcodeResult';
import { href, navigate, useApp, useAppState } from '../lib/hooks';
import { Header, Icon, Notice, Page, PrimaryButton } from '../ui/kit';

export function TypeCode() {
  const app = useApp();
  const { products } = useAppState();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const valid = canonicalEan(code) !== null && BARCODE_LENGTHS.includes(code.length);

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
      setError('Food database still loading.');
      return;
    }
    try {
      const route = await barcodeDestination(app.db, code);
      if (route) navigate(route);
      else setError('That is not a barcode.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return (
    <Page>
      <Header title="Type the code" back="/add" />
      <form onSubmit={find} className="flex flex-1 flex-col">
        <label htmlFor="code" className="sr-only">Barcode</label>
        <input
          id="code"
          className="card num mt-6 h-24 w-full bg-card text-center text-[32px] font-bold tracking-[0.08em] outline-none placeholder:text-faint focus:border-accent-2"
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
          <a href={href('add')} className="mt-2 flex h-11 items-center justify-center gap-2 text-sm font-semibold text-accent-2">
            <Icon name="search" size={18} />
            Search by name
          </a>
        </div>
      </form>
    </Page>
  );
}
