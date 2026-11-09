// The email one-time code flow (decision 34), shared by the phone and desktop sign-in screens.
// Sign-up is off: only invited accounts get a code.
import { useState, type FormEvent } from 'react';
import { useApp } from '../lib/hooks';

export function useSignInFlow() {
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

  return { email, setEmail, code, setCode, step, setStep, busy, error, sendCode, verify };
}

export type SignInFlow = ReturnType<typeof useSignInFlow>;
