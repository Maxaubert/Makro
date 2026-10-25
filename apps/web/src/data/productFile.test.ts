import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { gunzip, sha256Hex, syncProductFile, type LatestJson, type ProductFileDeps } from './productFile';
import { fixtureBytes } from './testing';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

async function bucket(opts: { schemaVersion?: number; dbVersion?: string; corrupt?: 'gz' | 'raw' } = {}) {
  const raw = await fixtureBytes(opts);
  const gz = new Uint8Array(gzipSync(raw));
  const latest: LatestJson = {
    db_version: opts.dbVersion ?? '2026.10.25',
    schema_version: opts.schemaVersion ?? 2,
    files: {
      'products.sqlite.gz': {
        path: `db-${opts.dbVersion ?? '2026.10.25'}/products.sqlite.gz`,
        bytes: gz.length,
        sha256: opts.corrupt === 'gz' ? '0'.repeat(64) : sha(gz),
        sha256_uncompressed: opts.corrupt === 'raw' ? '0'.repeat(64) : sha(raw),
      },
    },
  };
  return { raw, gz, latest };
}

function deps(b: Awaited<ReturnType<typeof bucket>>, installed: string | null): ProductFileDeps & {
  install: ReturnType<typeof vi.fn>;
  fetchFile: ReturnType<typeof vi.fn>;
} {
  return {
    fetchLatest: vi.fn(async () => b.latest),
    fetchFile: vi.fn(async () => b.gz),
    installedVersion: vi.fn(async () => installed),
    install: vi.fn(async () => undefined),
  };
}

describe('helpers', () => {
  it('gunzips with the platform DecompressionStream', async () => {
    const data = new TextEncoder().encode('skyr '.repeat(100));
    expect(await gunzip(new Uint8Array(gzipSync(data)))).toEqual(data);
  });
  it('hashes like sha256sum', async () => {
    const data = new TextEncoder().encode('abc');
    expect(await sha256Hex(data)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('syncProductFile', () => {
  it('downloads, checks both hashes and installs when nothing is installed', async () => {
    const b = await bucket();
    const d = deps(b, null);
    const r = await syncProductFile(d);
    expect(r).toEqual({ status: 'installed', db_version: '2026.10.25' });
    expect(d.fetchFile).toHaveBeenCalledWith('db-2026.10.25/products.sqlite.gz');
    expect(d.install).toHaveBeenCalledTimes(1);
    expect(d.install.mock.calls[0][0]).toEqual(b.raw);
    expect(d.install.mock.calls[0][1]).toEqual({ db_version: '2026.10.25', schema_version: 2 });
  });

  it('does not download again when the installed db_version is the same or newer', async () => {
    const b = await bucket();
    for (const installed of ['2026.10.25', '2026.10.26']) {
      const d = deps(b, installed);
      expect(await syncProductFile(d)).toEqual({ status: 'up-to-date', db_version: installed });
      expect(d.fetchFile).not.toHaveBeenCalled();
    }
  });

  it('downloads a newer db_version', async () => {
    const b = await bucket({ dbVersion: '2026.10.25-2' });
    const d = deps(b, '2026.10.25');
    expect(await syncProductFile(d)).toEqual({ status: 'installed', db_version: '2026.10.25-2' });
  });

  it('refuses schema_version below 2 without downloading', async () => {
    const b = await bucket({ schemaVersion: 1 });
    const d = deps(b, null);
    await expect(syncProductFile(d)).rejects.toThrow(/schema_version 1/);
    expect(d.fetchFile).not.toHaveBeenCalled();
  });

  it('keeps an older installed file when the bucket offers schema_version below 2', async () => {
    const b = await bucket({ schemaVersion: 1, dbVersion: '2026.11.01' });
    const d = deps(b, '2026.10.25');
    expect(await syncProductFile(d)).toMatchObject({ status: 'kept', db_version: '2026.10.25' });
    expect(d.install).not.toHaveBeenCalled();
  });

  it('refuses a file whose compressed sha256 does not match', async () => {
    const d = deps(await bucket({ corrupt: 'gz' }), null);
    await expect(syncProductFile(d)).rejects.toThrow(/sha256/);
    expect(d.install).not.toHaveBeenCalled();
  });

  it('refuses a file whose uncompressed sha256 does not match', async () => {
    const d = deps(await bucket({ corrupt: 'raw' }), null);
    await expect(syncProductFile(d)).rejects.toThrow(/sha256/);
    expect(d.install).not.toHaveBeenCalled();
  });

  it('keeps the installed file when offline', async () => {
    const b = await bucket();
    const d = deps(b, '2026.10.18');
    d.fetchLatest = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await syncProductFile(d)).toMatchObject({ status: 'kept', db_version: '2026.10.18' });
  });

  it('fails when offline and nothing is installed', async () => {
    const d = deps(await bucket(), null);
    d.fetchLatest = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(syncProductFile(d)).rejects.toThrow(/Failed to fetch/);
  });

  it('refuses a latest.json without the file', async () => {
    const b = await bucket();
    b.latest.files = {};
    await expect(syncProductFile(deps(b, null))).rejects.toThrow(/products.sqlite.gz/);
  });
});
