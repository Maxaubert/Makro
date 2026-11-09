import { describe, expect, it, vi } from 'vitest';
import { resolveSetup } from './setup';

const user = 'user-1';

describe('resolveSetup', () => {
  it('trusts the local mark, without a connection', async () => {
    const fetchFacts = vi.fn();
    await expect(resolveSetup({ userId: user, doneFor: user, fetchFacts })).resolves.toEqual({ status: 'done', hasConsent: true, hasGoal: true });
    expect(fetchFacts).not.toHaveBeenCalled();
  });
  it('ignores a mark left by another account', async () => {
    const fetchFacts = vi.fn().mockResolvedValue({ hasConsent: false, hasGoal: false });
    await expect(resolveSetup({ userId: user, doneFor: 'someone-else', fetchFacts })).resolves.toMatchObject({ status: 'needed' });
    expect(fetchFacts).toHaveBeenCalledOnce();
  });
  it('is done when the server has both consent and a goal', async () => {
    const r = await resolveSetup({ userId: user, doneFor: null, fetchFacts: async () => ({ hasConsent: true, hasGoal: true }) });
    expect(r).toEqual({ status: 'done', hasConsent: true, hasGoal: true });
  });
  it('asks for what is missing', async () => {
    const r = await resolveSetup({ userId: user, doneFor: null, fetchFacts: async () => ({ hasConsent: true, hasGoal: false }) });
    expect(r).toEqual({ status: 'needed', hasConsent: true, hasGoal: false });
  });
  it('never gives consent it could not check', async () => {
    const r = await resolveSetup({ userId: user, doneFor: null, fetchFacts: async () => { throw new Error('offline'); } });
    expect(r).toEqual({ status: 'offline', hasConsent: false, hasGoal: false });
  });
});
