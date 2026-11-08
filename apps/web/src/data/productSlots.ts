// The product file on the device, kept in two slots so a new download never destroys the
// working one. A new file is imported into the free slot and checked (opens, schema version,
// meta matches latest.json); only then is the old slot closed and removed. Any failure on the
// way (storage full, a bad file, a meta mismatch) removes the new file and leaves the old one
// open. The pool has no rename, so the active slot alternates between the two names.
import { compareDbVersion } from './dbVersion';
import { assertSupportedSchema, type ProductMeta } from './products';

/** The legacy single name first, so a file installed by an earlier build is found. */
export const PRODUCT_SLOTS = ['/products.sqlite', '/products-b.sqlite'] as const;

export interface SlotFs<H> {
  files(): string[];
  importDb(name: string, bytes: Uint8Array): Promise<void> | void;
  /** Opens a file; throws if it cannot be read. */
  open(name: string): H;
  /** The file's own meta; throws if it has none. */
  meta(handle: H): ProductMeta;
  close(handle: H): void;
  unlink(name: string): void;
}

interface Active<H> {
  name: string;
  handle: H;
  meta: ProductMeta;
}

export class ProductSlots<H> {
  private active: Active<H> | null = null;

  constructor(private readonly fs: SlotFs<H>) {}

  handle(): H | null {
    return this.active?.handle ?? null;
  }

  meta(): ProductMeta | null {
    return this.active?.meta ?? null;
  }

  /** On start: open the newest readable slot, remove the others (bad files and leftovers). */
  restore(): void {
    const present = new Set(this.fs.files());
    const good: Active<H>[] = [];
    for (const name of PRODUCT_SLOTS) {
      if (!present.has(name)) continue;
      const opened = this.tryOpen(name);
      if (opened) good.push(opened);
      else this.remove(name);
    }
    good.sort((a, b) => compareDbVersion(b.meta.db_version, a.meta.db_version));
    this.active = good[0] ?? null;
    for (const other of good.slice(1)) {
      this.fs.close(other.handle);
      this.remove(other.name);
    }
  }

  /** Install a verified product file. Checks the file's own meta against what was expected. */
  async install(bytes: Uint8Array, expected: { db_version: string; schema_version: number } | null): Promise<ProductMeta> {
    const name = PRODUCT_SLOTS.find((n) => n !== this.active?.name) as string;
    this.remove(name);
    let next: Active<H> | null = null;
    try {
      await this.fs.importDb(name, bytes);
      const handle = this.fs.open(name);
      next = { name, handle, meta: this.fs.meta(handle) };
      assertSupportedSchema(next.meta);
      if (expected && (next.meta.db_version !== expected.db_version || next.meta.schema_version !== expected.schema_version)) {
        throw new Error(
          `the file says db_version ${next.meta.db_version} / schema_version ${next.meta.schema_version}, latest.json said ${expected.db_version} / ${expected.schema_version}`,
        );
      }
    } catch (e) {
      if (next) this.fs.close(next.handle);
      this.remove(name);
      throw e;
    }
    const old = this.active;
    this.active = next;
    if (old) {
      this.fs.close(old.handle);
      this.remove(old.name);
    }
    return next.meta;
  }

  private tryOpen(name: string): Active<H> | null {
    let handle: H | null = null;
    try {
      handle = this.fs.open(name);
      const meta = this.fs.meta(handle);
      assertSupportedSchema(meta);
      return { name, handle, meta };
    } catch {
      if (handle !== null) this.fs.close(handle);
      return null;
    }
  }

  private remove(name: string): void {
    try {
      if (this.fs.files().includes(name)) this.fs.unlink(name);
    } catch {
      // Best effort: a leftover file is removed on the next start.
    }
  }
}
