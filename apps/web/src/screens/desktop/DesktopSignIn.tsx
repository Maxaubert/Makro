// D_SignIn: the centred sign-in at desktop width. The web signs in with an emailed code (decision 34),
// so the board's Apple button and its "or" divider are left out.
import { Notice, PrimaryButton } from '../../ui/kit';
import type { SignInFlow } from '../signInFlow';

const PILL_FIELD =
  'h-14 w-full rounded-full border border-border bg-card px-[22px] text-base text-text placeholder:text-secondary focus:border-accent-2';

export function DesktopSignIn({ flow }: { flow: SignInFlow }) {
  const { email, setEmail, code, setCode, step, setStep, busy, error, sendCode, verify } = flow;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_50%_30%,#2A1308_0%,#0D0D0E_60%)] [line-height:normal]">
      <div className="w-[420px] text-center">
        <span className="inline-flex h-[72px] w-[72px] items-center justify-center rounded-[22px] bg-accent text-[40px] font-bold text-ground" aria-hidden="true">
          M
        </span>
        <h1 className="mt-[22px] text-[36px] font-bold tracking-[-1px]">Sign in to Makro</h1>
        <p className="mt-2 text-[15px] text-secondary">Your log syncs between your phone and this browser.</p>

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
            <PrimaryButton type="submit" disabled={busy || !email.includes('@')}>
              {busy ? 'Sending' : 'Email me a code'}
            </PrimaryButton>
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
            <PrimaryButton type="submit" disabled={busy || code.length !== 6}>
              {busy ? 'Checking' : 'Sign in'}
            </PrimaryButton>
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
