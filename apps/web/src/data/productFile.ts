// Keeping products.sqlite current in the browser (plan part B, step 2).
// The private "products" bucket holds latest.json (written last by nutrition-data's
// tools/upload_to_bucket.py) and the gzipped files. This module decides whether to download,
// then checks the compressed and uncompressed sha256 and the schema version before installing.
// Network, storage and OPFS are injected, so the rules are unit-tested in Node.
import { isNewerDbVersion } from './dbVersion';
import { MIN_SCHEMA_VERSION } from './products';

export const PRODUCT_FILE = 'products.sqlite.gz';

export interface LatestFile {
  path: string;
  bytes: number;
  sha256: string;
  sha256_uncompressed?: string;
  variant?: string;
}

export interface LatestJson {
  db_version: string;
  schema_version: number;
  files: Record<string, LatestFile>;
}

export interface ProductFileDeps {
  /** latest.json from the bucket. Throws when offline. */
  fetchLatest(): Promise<LatestJson>;
  /** One object from the bucket, by its path. */
  fetchFile(path: string): Promise<Uint8Array>;
  /** db_version of the installed file, or null. */
  installedVersion(): Promise<string | null>;
  /** Store the verified, uncompressed file (OPFS) and open it. Must check the file's own meta. */
  install(bytes: Uint8Array, expected: { db_version: string; schema_version: number }): Promise<void>;
  /** Which file of latest.json to use; the full variant by default. */
  fileName?: string;
}

export type ProductFileResult =
  | { status: 'installed' | 'up-to-date'; db_version: string }
  | { status: 'kept'; db_version: string; reason: string };

export async function gunzip(gz: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([gz as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function syncProductFile(deps: ProductFileDeps): Promise<ProductFileResult> {
  const installed = await deps.installedVersion();
  let latest: LatestJson;
  try {
    latest = await deps.fetchLatest();
  } catch (e) {
    if (installed !== null) return { status: 'kept', db_version: installed, reason: String(e) };
    throw e;
  }

  if (!(latest.schema_version >= MIN_SCHEMA_VERSION)) {
    const reason = `the bucket offers schema_version ${latest.schema_version}; this app needs ${MIN_SCHEMA_VERSION} or newer`;
    if (installed !== null) return { status: 'kept', db_version: installed, reason };
    throw new Error(reason);
  }
  if (!isNewerDbVersion(latest.db_version, installed)) {
    return { status: 'up-to-date', db_version: installed as string };
  }

  const name = deps.fileName ?? PRODUCT_FILE;
  const file = latest.files?.[name];
  if (!file || !file.path || !file.sha256 || !file.sha256_uncompressed) {
    throw new Error(`latest.json does not describe ${name} with both sha256 values`);
  }
  const gz = await deps.fetchFile(file.path);
  const gzSha = await sha256Hex(gz);
  if (gzSha !== file.sha256.toLowerCase()) throw new Error(`${name}: sha256 ${gzSha} does not match latest.json`);
  const raw = await gunzip(gz);
  const rawSha = await sha256Hex(raw);
  if (rawSha !== file.sha256_uncompressed.toLowerCase()) {
    throw new Error(`${name} unpacked: sha256 ${rawSha} does not match latest.json`);
  }
  await deps.install(raw, { db_version: latest.db_version, schema_version: latest.schema_version });
  return { status: 'installed', db_version: latest.db_version };
}
