// D_SignIn: the centred sign-in at desktop width. The web signs in with an emailed code (decision 34),
// so the board's Apple button and its "or" divider are left out.
import { Notice } from '../../ui/kit';
import type { SignInFlow } from '../signInFlow';

// The board shows the action in orange before anything is typed, so a disabled button stays orange and dimmed.
const PILL_BUTTON = 'tap flex h-14 w-full items-center justify-center rounded-full bg-accent text-base font-bold text-ground disabled:opacity-50';

const PILL_FIELD =
  'h-14 w-full rounded-full border border-border bg-card px-[22px] text-base text-text placeholder:text-secondary focus:border-accent-2';

export function DesktopSignIn({ flow }: { flow: SignInFlow }) {
  const { email, setEmail, code, setCode, step, setStep, busy, error, sendCode, verify } = flow;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ground [line-height:normal]">
      <div className="w-[420px] text-center">
        <img src="/icon.svg" alt="" className="inline-block h-[72px] w-[72px]" aria-hidden="true" />
        <h1 className="mt-[22px] text-[36px] font-bold tracking-[-1px]">Sign in to Makro</h1>
        {step === 'email' ? (
          <form onSubmit={sendCode} className="mt-8 flex flex-col gap-3">
            <label htmlFor="email" className="sr-only">
              Email address
            </label>
            <input
              id="email"
              className={PILL_FIELD}
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
            />
            <button type="submit" className={PILL_BUTTON} disabled={busy || !email.includes('@')}>
              {busy ? 'Sending' : 'Email me a code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-8 flex flex-col gap-3">
            <label htmlFor="code" className="text-[13px] text-secondary">
              6-digit code sent to <b className="text-text">{email}</b>
            </label>
            <input
              id="code"
              className={`${PILL_FIELD} num text-center text-2xl tracking-[0.3em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <button type="submit" className={PILL_BUTTON} disabled={busy || code.length !== 6}>
              {busy ? 'Checking' : 'Sign in'}
            </button>
            <button type="button" className="tap h-11 text-sm font-semibold text-accent-2" onClick={() => setStep('email')}>
              Use another email
            </button>
          </form>
        )}
        {error && (
          <div className="mt-4 text-left">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
      </div>
    </div>
  );
}
