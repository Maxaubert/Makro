// Sign in with an email one-time code (decision 34). Sign-up is off: only invited accounts get a code.
import { useState, type FormEvent } from 'react';
import { useApp } from '../lib/hooks';
import { Notice, Page, PrimaryButton } from '../ui/kit';

export function SignIn() {
  const app = useApp();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await app.supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) {
      setError(
        /signups? not allowed|not found|disabled/i.test(error.message)
          ? 'No Makro account uses this email. Accounts are by invitation for now.'
          : error.message,
      );
      return;
    }
    setStep('code');
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await app.supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError(/expired|invalid/i.test(error.message) ? 'That code is wrong or has expired. Check the newest email.' : error.message);
  }

  return (
    <Page>
      <div className="flex flex-1 flex-col justify-center gap-6 py-10">
        <div>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-2xl font-bold text-ground" aria-hidden="true">
            M
          </span>
          <h1 className="mt-5 text-[28px] font-bold tracking-[-0.02em]">Sign in to Makro</h1>
          <p className="mt-1 text-secondary">Your log syncs between your phone and this browser.</p>
        </div>

        {step === 'email' ? (
          <form onSubmit={sendCode} className="flex flex-col gap-3">
            <label htmlFor="email" className="text-[13px] text-secondary">
              Email address
            </label>
            <input
              id="email"
              className="field"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <PrimaryButton type="submit" disabled={busy || !email.includes('@')}>
              {busy ? 'Sending' : 'Email me a code'}
            </PrimaryButton>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-3">
            <label htmlFor="code" className="text-[13px] text-secondary">
              6-digit code sent to <b className="text-text">{email}</b>
            </label>
            <input
              id="code"
              className="field num text-center text-2xl tracking-[0.3em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <PrimaryButton type="submit" disabled={busy || code.length !== 6}>
              {busy ? 'Checking' : 'Sign in'}
            </PrimaryButton>
            <button type="button" className="tap h-11 text-sm font-semibold text-accent-2" onClick={() => setStep('email')}>
              Use another email
            </button>
          </form>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Page>
  );
}
