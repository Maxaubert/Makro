// First run, B16 to B18 on the canvas: welcome, your data (consent), about you, your goals.
// Every number comes from deterministic code (domain/goals.ts) and can be edited, within the limits.
import { useState, type ReactNode } from 'react';
import { buildGoalChange } from '../domain/goalForm';
import { browserTimeZone } from '../domain/localDate';
import { useApp } from '../lib/hooks';
import { Icon, Notice, Page, PrimaryButton, SecondaryButton } from '../ui/kit';
import { DeleteAccount } from './DeleteAccount';
import { AboutFields, GoalFields, useGoalForm } from './goalFields';
import { PrivacyBody } from './Privacy';

type Step = 'welcome' | 'consent' | 'about' | 'goals';
const ORDER: Step[] = ['welcome', 'consent', 'about', 'goals'];

function Progress({ step, back }: { step: Step; back: (() => void) | null }) {
  const n = ORDER.indexOf(step) + 1;
  return (
    <div className="flex items-center gap-2 pt-3">
      {back ? (
        <button type="button" aria-label="Back" onClick={back} className="-ml-2 flex h-11 w-11 items-center justify-center">
          <Icon name="back" />
        </button>
      ) : (
        <span className="-ml-2 h-11 w-11" />
      )}
      <div className="flex flex-1 gap-1.5" role="img" aria-label={`Step ${n} of ${ORDER.length}`}>
        {ORDER.map((s, i) => (
          <span key={s} className={`h-1 flex-1 rounded-sm ${i < n ? 'bg-accent' : 'bg-border'}`} />
        ))}
      </div>
      <span className="ml-2 text-[13px] text-secondary">{n} of {ORDER.length}</span>
    </div>
  );
}

function Choice({ tag, label, on, onToggle }: { tag: string; label: ReactNode; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onToggle}
      className={`flex w-full items-start gap-3 rounded-2xl bg-card p-3.5 text-left ${on ? 'border-[1.5px] border-accent' : 'border border-border'}`}
    >
      <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-[7px] text-ground ${on ? 'bg-accent' : 'border-[1.5px] border-muted'}`}>
        {on && <Icon name="check" size={14} stroke={3.5} />}
      </span>
      <span className="flex-1">
        <span className="block text-[11px] text-secondary">{tag}</span>
        <span className="mt-0.5 block text-[15px] font-semibold leading-snug">{label}</span>
      </span>
    </button>
  );
}

export function Onboarding({ hasConsent, hasGoal }: { hasConsent: boolean; hasGoal: boolean }) {
  const app = useApp();
  const [step, setStep] = useState<Step>(hasConsent ? 'about' : 'welcome');
  const [health, setHealth] = useState(false);
  const [popular, setPopular] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = useGoalForm();

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const consentContinue = () =>
    run(async () => {
      await app.giveConsent({ popularity: popular });
      if (hasGoal) await app.finishSetup(null);
      else setStep('about');
    });

  if (showPrivacy) {
    return (
      <Page>
        <div className="pt-3">
          <button type="button" aria-label="Back" onClick={() => setShowPrivacy(false)} className="-ml-2 flex h-11 w-11 items-center justify-center"><Icon name="back" /></button>
        </div>
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em]">Privacy</h1>
        <PrivacyBody />
      </Page>
    );
  }

  if (step === 'welcome') {
    return (
      <Page>
        <Progress step="welcome" back={null} />
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <img src="/icon.svg" alt="" className="h-28 w-28" aria-hidden="true" />
          <h1 className="mt-8 text-[40px] font-bold leading-none tracking-[-0.03em]">Makro</h1>
          <p className="mt-3 text-lg text-secondary">Log food in seconds.</p>
        </div>
        <div className="pb-6"><PrimaryButton onClick={() => setStep('consent')}>Get started</PrimaryButton></div>
      </Page>
    );
  }

  if (step === 'consent') {
    return (
      <Page>
        <Progress step="consent" back={() => setStep('welcome')} />
        <h1 className="pt-4 text-[30px] font-bold leading-tight tracking-[-0.02em]">Your data</h1>
        <div className="mt-4 rounded-[20px] border border-border bg-card p-4 text-[14px] leading-relaxed text-soft">
          Weight, height, goals and what you eat can say something about your health, so Makro asks first. It is stored in the EU. You can download or delete it any time in Account.
          <button type="button" className="mt-2.5 block font-semibold text-accent-2" onClick={() => setShowPrivacy(true)}>Read the privacy notice</button>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <Choice tag="Needed to use Makro" label="Store my weight, height, goals and food log so I can track them" on={health} onToggle={() => setHealth(!health)} />
          <Choice tag="Optional" label="Let what I log count toward which foods are popular. Only totals are shared, never who logged what" on={popular} onToggle={() => setPopular(!popular)} />
        </div>
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-auto flex flex-col gap-2 pb-6 pt-4">
          <PrimaryButton disabled={!health || busy} onClick={() => void consentContinue()}>Continue</PrimaryButton>
          <SecondaryButton onClick={() => void app.signOut()}>Not now, sign out</SecondaryButton>
          <DeleteAccount />
        </div>
      </Page>
    );
  }

  if (step === 'about') {
    return (
      <Page>
        <Progress step="about" back={hasConsent ? null : () => setStep('consent')} />
        <h1 className="pt-4 text-[30px] font-bold leading-tight tracking-[-0.02em]">About you</h1>
        <AboutFields state={state} />
        <div className="mt-auto pb-6 pt-4">
          <PrimaryButton disabled={!state.evaluation.aboutOk} onClick={() => setStep('goals')}>Continue</PrimaryButton>
        </div>
      </Page>
    );
  }

  const save = () =>
    run(async () => {
      const { goal, weight } = buildGoalChange(state.form, null, new Date(), browserTimeZone());
      if (!weight) return;
      await app.finishSetup({ goal, weight });
    });

  return (
    <Page>
      <Progress step="goals" back={() => setStep('about')} />
      <h1 className="pt-3 text-[30px] font-bold leading-tight tracking-[-0.02em]">Your goals</h1>
      <GoalFields state={state} error={error} />
      <div className="mt-auto pb-6 pt-4">
        <PrimaryButton disabled={!state.evaluation.canSave || busy} onClick={() => void save()}>Start logging</PrimaryButton>
      </div>
    </Page>
  );
}
