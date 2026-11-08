// Product database versions (products-db.md, Delivery and versions): YYYY.MM.DD, with -2, -3
// for a second build the same day. nutrition-data's upload script writes the suffix as .N,
// so both spellings are read.
const VERSION = /^(\d{4})\.(\d{2})\.(\d{2})(?:[-.](\d+))?$/;

function parts(v: string): number[] {
  const m = VERSION.exec(v);
  if (!m) throw new Error(`not a db_version: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ? Number(m[4]) : 1];
}

export function compareDbVersion(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/** True when `candidate` should replace what is installed (null = nothing installed). */
export function isNewerDbVersion(candidate: string, installed: string | null): boolean {
  return installed === null || compareDbVersion(candidate, installed) > 0;
}
