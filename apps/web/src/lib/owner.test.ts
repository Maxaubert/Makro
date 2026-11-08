import { describe, expect, it } from 'vitest';
import { guardOwner, ownerReady } from './owner';

describe('ownerReady', () => {
  it('is false until the local log is claimed for the signed-in user', () => {
    expect(ownerReady('user-a', null)).toBe(false);
    expect(ownerReady('user-a', 'user-b')).toBe(false);
    expect(ownerReady(null, 'user-a')).toBe(false);
    expect(ownerReady('user-a', 'user-a')).toBe(true);
  });
});

describe('guardOwner', () => {
  it('runs the call while the same user is signed in and owns the log', async () => {
    const current = { session: 'user-a', owner: 'user-a' };
    const call = guardOwner(() => current, 'user-a', async (x: number) => x * 2);
    await expect(call(2)).resolves.toBe(4);
  });

  it('refuses a call after the user changed or signed out, so a running sync stops', async () => {
    const current: { session: string | null; owner: string | null } = { session: 'user-a', owner: 'user-a' };
    let calls = 0;
    const call = guardOwner(() => current, 'user-a', async () => { calls += 1; });
    current.session = 'user-b';
    await expect(call()).rejects.toThrow(/account changed/);
    current.session = null;
    await expect(call()).rejects.toThrow(/account changed/);
    expect(calls).toBe(0);
  });

  it('refuses a result that arrives after the user changed', async () => {
    const current: { session: string | null; owner: string | null } = { session: 'user-a', owner: 'user-a' };
    const call = guardOwner(() => current, 'user-a', async () => { current.owner = null; return 1; });
    await expect(call()).rejects.toThrow(/account changed/);
  });
});
