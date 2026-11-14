// Sign in with an email one-time code (decision 34). Phone layout here, D_SignIn in desktop/DesktopSignIn.
import { useIsDesktop } from '../lib/hooks';
import { Notice, Page, PrimaryButton } from '../ui/kit';
import { DesktopSignIn } from './desktop/DesktopSignIn';
import { useSignInFlow, type SignInFlow } from './signInFlow';

export function SignIn() {
  // The flow lives here so a window resized across the breakpoint keeps what was typed.
  const flow = useSignInFlow();
  return useIsDesktop() ? <DesktopSignIn flow={flow} /> : <PhoneSignIn flow={flow} />;
}

function PhoneSignIn({ flow }: { flow: SignInFlow }) {
  const { email, setEmail, code, setCode, step, setStep, busy, error, sendCode, verify } = flow;
  return (
    <Page>
      <div className="flex flex-1 flex-col justify-center gap-6 py-10">
        <div>
          <img src="/icon.svg" alt="" className="h-12 w-12" aria-hidden="true" />
          <h1 className="mt-5 text-[28px] font-bold tracking-[-0.02em]">Sign in to Makro</h1>        </div>

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
