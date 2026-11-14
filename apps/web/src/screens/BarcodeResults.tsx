// The two screens after a scan or a typed code that does not end on the portion screen.
// Not in the database (B_NotFound) leads to a quick custom food with the code attached.
// No nutrition data (B_NoData) leads to the same form with name and brand filled in, or on to
// logging without numbers (rule 5). Saving that form queues the anonymous miss, in CustomFood.
import { canonicalEan } from '../data/barcode';
import { productSubtext } from '../data/products';
import { href, useApp, useAppState, useData, useQueryParam } from '../lib/hooks';
import { canTryScan } from '../lib/scanner';
import { Header, Icon, Notice, Page, SecondaryButton, SourceBadge } from '../ui/kit';

const PRIMARY_LINK = 'tap flex h-14 w-full items-center justify-center rounded-full bg-accent text-base font-bold text-ground';

function grouped(code: string): string {
  if (code.length === 13) return `${code.slice(0, 1)} ${code.slice(1, 7)} ${code.slice(7)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  return code;
}

function customHref(values: { name?: string; brand?: string | null; ean: string | null }): string {
  const q = new URLSearchParams({ name: values.name ?? '', brand: values.brand ?? '', ean: values.ean ?? '' });
  return `${href('custom')}?${q.toString()}`;
}

export function BarcodeNotFound({ code }: { code: string }) {
  const ean = canonicalEan(code);
  const canScan = canTryScan();
  return (
    <Page>
      <Header title="" back="/scan" />
      <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <span className="flex h-28 w-28 items-center justify-center rounded-full border border-border bg-card text-accent-2">
          <Icon name="noBarcode" size={52} stroke={1.6} />
        </span>
        <h2 className="mt-7 text-[30px] font-bold tracking-[-0.03em]">Not in the database</h2>
        {ean && <div className="num mt-3.5 flex h-[34px] items-center rounded-full border border-border bg-card px-4 text-[15px] tracking-[0.07em] text-soft">{grouped(ean)}</div>}
      </div>
      <div className="flex flex-col gap-2 pt-3">
        <a href={customHref({ ean })} className={PRIMARY_LINK}>Add custom food</a>
        <SecondaryButton href={href(canScan ? 'scan' : 'code')}>{canScan ? 'Scan again' : 'Try another code'}</SecondaryButton>
      </div>
    </Page>
  );
}

export function BarcodeNoData({ id }: { id: string }) {
  const app = useApp();
  const { products } = useAppState();
  const ready = products.status === 'ready';
  const ean = useQueryParam('ean');
  const { data, error } = useData(async () => (ready ? app.db.product(id) : null), [id, ready]);

  if (!data || data.status === 'removed') {
    return (
      <Page>
        <Header title="" back="/scan" />
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        {data?.status === 'removed' && <div className="mt-4"><Notice>No longer in the food database.</Notice></div>}
      </Page>
    );
  }

  const p = data.product;
  return (
    <Page>
      <Header title="" back="/scan" />
      <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <span className="flex h-28 w-28 items-center justify-center rounded-full border-[1.5px] border-dashed border-strong bg-card text-secondary">
          <Icon name="alert" size={52} stroke={1.6} />
        </span>
        <h2 className="mt-7 text-[30px] font-bold tracking-[-0.03em]" data-testid="no-data-name">{p.name}</h2>
        {productSubtext(p) && <div className="mt-1.5 text-[15px] text-secondary">{productSubtext(p)}</div>}
        <div className="mt-5 flex items-center gap-3">
          <div className="flex h-[34px] items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-accent-2">
            No nutrition data
          </div>
          <SourceBadge sourceName={p.source_name} verified={p.verified} detail />
        </div>
      </div>
      <div className="flex flex-col gap-2 pt-3">
        <a href={customHref({ name: p.name, brand: p.brand, ean: ean ?? p.ean })} className={PRIMARY_LINK}>Enter numbers from the label</a>
        <SecondaryButton href={href('portion', 'product', p.id)}>Log without numbers</SecondaryButton>
      </div>
    </Page>
  );
}
