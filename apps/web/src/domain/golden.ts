// Test helper: loads a golden file from packages/contracts and checks the shared format
// (packages/contracts/README.md). Used only by the *.test.ts runners, never by the app.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';

export interface GoldenCase<I, E> {
  id: string;
  input: I;
  expected: E;
  note?: string;
}

export interface GoldenFile<I, E> {
  version: number;
  description: string;
  nutrients?: string[];
  cases: GoldenCase<I, E>[];
}

const contractsDir = new URL('../../../../packages/contracts/', import.meta.url);

export function loadGolden<I, E>(relativePath: string): GoldenFile<I, E> {
  const path = fileURLToPath(new URL(relativePath, contractsDir));
  const file = JSON.parse(readFileSync(path, 'utf8')) as GoldenFile<I, E>;
  if (typeof file.version !== 'number') throw new Error(`${relativePath}: missing version`);
  if (typeof file.description !== 'string') throw new Error(`${relativePath}: missing description`);
  if (!Array.isArray(file.cases) || file.cases.length === 0) throw new Error(`${relativePath}: no cases`);
  const ids = new Set<string>();
  for (const c of file.cases) {
    if (ids.has(c.id)) throw new Error(`${relativePath}: duplicate case id ${c.id}`);
    ids.add(c.id);
    if (!Object.hasOwn(c, 'input') || !Object.hasOwn(c, 'expected')) throw new Error(`${relativePath}: ${c.id} lacks input or expected`);
  }
  return file;
}

/** The pinned tolerance from packages/contracts/README.md: |a - e| <= max(1e-9 * max(|a|, |e|), 1e-9). */
export function expectClose(actual: number | null, expected: number | null, label: string): void {
  if (expected === null) {
    expect(actual, `${label}: expected null (unknown)`).toBeNull();
    return;
  }
  expect(actual, `${label}: expected a number, got null`).not.toBeNull();
  const a = actual as number;
  const tol = Math.max(1e-9 * Math.max(Math.abs(a), Math.abs(expected)), 1e-9);
  expect(Math.abs(a - expected) <= tol, `${label}: ${a} is not ${expected}`).toBe(true);
}

/** Runners fail on a missing nutrient key: every key must be present, with explicit null when unknown. */
export function requireKeys(obj: Record<string, unknown>, keys: string[], label: string): void {
  for (const k of keys) {
    if (!(k in obj)) throw new Error(`${label}: missing key ${k}`);
  }
}
