// First-run setup: a user needs an active health-data consent and a goal before the app opens.
// Once finished on this device it is remembered locally, so logging never waits for the network.

export type SetupStatus = 'checking' | 'needed' | 'done' | 'offline';

export interface SetupState {
  status: SetupStatus;
  hasConsent: boolean;
  hasGoal: boolean;
}

export interface SetupFacts {
  hasConsent: boolean;
  hasGoal: boolean;
}

export const CONSENT_TEXT_VERSION = '2026-11-14';

export async function resolveSetup(opts: {
  userId: string;
  doneFor: string | null;
  fetchFacts: () => Promise<SetupFacts>;
}): Promise<SetupState> {
  if (opts.doneFor === opts.userId) return { status: 'done', hasConsent: true, hasGoal: true };
  let facts: SetupFacts;
  try {
    facts = await opts.fetchFacts();
  } catch {
    return { status: 'offline', hasConsent: false, hasGoal: false };
  }
  return { status: facts.hasConsent && facts.hasGoal ? 'done' : 'needed', ...facts };
}
