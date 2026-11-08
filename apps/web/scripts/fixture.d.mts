import type { Database } from '@sqlite.org/sqlite-wasm';

export const FIXTURE_DB_VERSION: string;
export const FIXTURE_PRODUCTS: ReadonlyArray<ReadonlyArray<string | number | null>>;
export function buildFixture(db: Database, opts?: { schemaVersion?: number; dbVersion?: string }): void;
