import { describe, expect, it } from 'vitest';
import { ProductSlots, PRODUCT_SLOTS, type SlotFs } from './productSlots';
import type { ProductMeta } from './products';

// A fake pool: a file's bytes are its meta as JSON, or "bad" for an unreadable file.
function fakeFs(opts: { quotaFiles?: number } = {}) {
  const files = new Map<string, string>();
  const open = new Set<string>();
  const fs: SlotFs<{ name: string; meta: ProductMeta }> = {
    files: () => [...files.keys()],
    async importDb(name, bytes) {
      if (opts.quotaFiles !== undefined && !files.has(name) && files.size >= opts.quotaFiles) throw new Error('QuotaExceededError');
      files.set(name, new TextDecoder().decode(bytes));
    },
    open(name) {
      const raw = files.get(name);
      if (raw === undefined || raw === 'bad') throw new Error(`cannot open ${name}`);
      open.add(name);
      return { name, meta: JSON.parse(raw) as ProductMeta };
    },
    meta: (h) => h.meta,
    close(h) {
      open.delete(h.name);
    },
    unlink(name) {
      if (open.has(name)) throw new Error(`${name} is open`);
      files.delete(name);
    },
  };
  return { fs, files, open };
}

const file = (db_version: string, schema_version = 2) =>
  new TextEncoder().encode(JSON.stringify({ db_version, schema_version, variant: null }));

describe('product file slots', () => {
  it('installs into a second file and drops the old one only after the new one checks out', async () => {
    const { fs, files } = fakeFs();
    const slots = new ProductSlots(fs);
    await slots.install(file('2026.10.01'), { db_version: '2026.10.01', schema_version: 2 });
    await slots.install(file('2026.10.25'), { db_version: '2026.10.25', schema_version: 2 });
    expect(slots.meta()?.db_version).toBe('2026.10.25');
    expect(files.size).toBe(1);
  });

  it('keeps the old file open and working when the new file does not match latest.json', async () => {
    const { fs, files } = fakeFs();
    const slots = new ProductSlots(fs);
    await slots.install(file('2026.10.01'), null);
    await expect(slots.install(file('2026.10.24'), { db_version: '2026.10.25', schema_version: 2 })).rejects.toThrow(/latest.json/);
    expect(slots.meta()?.db_version).toBe('2026.10.01');
    expect(slots.handle()).not.toBeNull();
    expect(files.size).toBe(1);
  });

  it('keeps the old file when the new one is unreadable or too old a schema', async () => {
    const { fs } = fakeFs();
    const slots = new ProductSlots(fs);
    await slots.install(file('2026.10.01'), null);
    await expect(slots.install(new TextEncoder().encode('bad'), null)).rejects.toThrow();
    await expect(slots.install(file('2026.10.25', 1), null)).rejects.toThrow(/schema/i);
    expect(slots.meta()?.db_version).toBe('2026.10.01');
  });

  it('keeps the old file when the import itself fails (storage full)', async () => {
    const { fs } = fakeFs({ quotaFiles: 1 });
    const slots = new ProductSlots(fs);
    await slots.install(file('2026.10.01'), null);
    await expect(slots.install(file('2026.10.25'), null)).rejects.toThrow(/Quota/);
    expect(slots.meta()?.db_version).toBe('2026.10.01');
    expect(slots.handle()).not.toBeNull();
  });

  it('restores the newest readable file on start and removes the rest', async () => {
    const { fs, files } = fakeFs();
    await fs.importDb(PRODUCT_SLOTS[0], file('2026.10.01'));
    await fs.importDb(PRODUCT_SLOTS[1], file('2026.10.25'));
    const slots = new ProductSlots(fs);
    slots.restore();
    expect(slots.meta()?.db_version).toBe('2026.10.25');
    expect([...files.keys()]).toEqual([PRODUCT_SLOTS[1]]);
  });

  it('drops an unreadable file on start and reports nothing installed', async () => {
    const { fs, files } = fakeFs();
    await fs.importDb(PRODUCT_SLOTS[0], new TextEncoder().encode('bad'));
    const slots = new ProductSlots(fs);
    slots.restore();
    expect(slots.meta()).toBeNull();
    expect(files.size).toBe(0);
  });
});
