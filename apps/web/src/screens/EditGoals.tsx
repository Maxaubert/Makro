// Changing About you and Goals after first-run setup (#73). Same fields and limits as onboarding.
// As on the canvas, About you continues to Your goals, so a recalculated target is seen before it is saved.
import { useState } from 'react';
import { buildGoalChange, canStartAtGoals, prefillGoalForm, type Prefill } from '../domain/goalForm';
import { browserTimeZone } from '../domain/localDate';
import { useApp, useBack, useData } from '../lib/hooks';
import { Icon, Notice, Page, PrimaryButton } from '../ui/kit';
import { AboutFields, GoalFields, useGoalForm } from './goalFields';

type Step = 'about' | 'goals';

function Editor({ initial, start }: { initial: Prefill; start: Step }) {
  const app = useApp();
  const state = useGoalForm(initial);
  // Without a whole profile the limits cannot be checked, so it is asked for first.
  const [first] = useState<Step>(start === 'goals' && canStartAtGoals(initial) ? 'goals' : 'about');
  const [step, setStep] = useState<Step>(first);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leave = useBack('/account');
  const { form, evaluation, prefill } = state;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (!evaluation.unchanged) {
        const { goal, weight } = buildGoalChange(form, prefill.baseline, new Date(), browserTimeZone());
        await app.db.saveGoalChange(goal, weight);
        await app.changed();
      }
      leave();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Page>
      <div className="pt-3">
        <button type="button" aria-label="Back" onClick={step === 'goals' && first === 'about' ? () => setStep('about') : leave} className="-ml-2 flex h-11 w-11 items-center justify-center">
          <Icon name="back" />
        </button>
      </div>
      <h1 className="pt-3 text-[30px] font-bold leading-tight tracking-[-0.02em]">{step === 'about' ? 'About you' : 'Your goals'}</h1>
      {step === 'about' ? <AboutFields state={state} /> : <GoalFields state={state} error={error} />}
      <div className="mt-auto pb-6 pt-4">
        {step === 'about' ? (
          <PrimaryButton disabled={!evaluation.aboutOk} onClick={() => setStep('goals')}>Continue</PrimaryButton>
        ) : (
          <PrimaryButton disabled={!evaluation.canSave || busy} onClick={() => void save()}>Save</PrimaryButton>
        )}
      </div>
    </Page>
  );
}

export function EditGoals({ start }: { start: Step }) {
  const app = useApp();
  const { data: goal, error } = useData(() => app.db.latestGoal(), []);
  if (error) {
    return (
      <Page>
        <div className="pt-6"><Notice tone="error">{error}</Notice></div>
      </Page>
    );
  }
  if (goal === undefined) return <Page><div className="flex-1" aria-busy="true" /></Page>;
  return <Editor initial={prefillGoalForm(goal, new Date().getFullYear())} start={start} />;
}
