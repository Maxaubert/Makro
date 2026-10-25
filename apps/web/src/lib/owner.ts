// The local log belongs to one account at a time. Screens and syncs run only while the
// signed-in user is the one the log was claimed for, so a second account in the same
// browser never sees or syncs the first account's rows.

export interface OwnerView {
  session: string | null;
  owner: string | null;
}

export function ownerReady(session: string | null, owner: string | null): boolean {
  return session !== null && session === owner;
}

/** Wrap a call so it runs, and its result counts, only while `runOwner` is still signed in and owns the log. */
export function guardOwner<A extends unknown[], R>(
  current: () => OwnerView,
  runOwner: string,
  call: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  const check = () => {
    const { session, owner } = current();
    if (session !== runOwner || owner !== runOwner) throw new Error('The account changed during sync; the run was stopped.');
  };
  return async (...args: A) => {
    check();
    const result = await call(...args);
    check();
    return result;
  };
}
