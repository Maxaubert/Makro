// First run, B16 to B18 on the canvas: welcome, your data (consent), about you, your goals.
// Every number comes from deterministic code (domain/goals.ts) and can be edited, within the limits.
import { useMemo, useState, type ReactNode } from 'react';
import { buildGoal, buildWeightEntry } from '../domain/entry';
import { calculateTargets, goalProblem, kcalFloor, profileProblem, GOAL_CONSTANTS, type ActivityLevel, type GoalType, type Sex } from '../domain/goals';
import { browserTimeZone } from '../domain/localDate';
import { useApp } from '../lib/hooks';
import { Chip, Icon, Notice, Page, PrimaryButton, SecondaryButton } from '../ui/kit';
import { DeleteAccount } from './DeleteAccount';
import { PrivacyBody } from './Privacy';

type Step = 'welcome' | 'consent' | 'about' | 'goals';
const ORDER: Step[] = ['welcome', 'consent', 'about', 'goals'];

const ACTIVITY: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Mostly sitting' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very active' },
];
const GOAL_TYPES: { value: GoalType; label: string; pace: number }[] = [
  { value: 'lose', label: 'Lose', pace: 0.5 },
  { value: 'maintain', label: 'Maintain', pace: 0 },
  { value: 'gain', label: 'Gain', pace: 0.25 },
];

/** Chips that share the row evenly and are tall enough to tap, as on the canvas. */
const FULL_CHIPS = 'flex gap-2 [&>button]:h-12 [&>button]:flex-1 [&>button]:justify-center [&>button]:text-[15px]';

const toNumber = (text: string): number => (text.trim() === '' ? Number.NaN : Number(text.trim().replace(',', '.')));

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

function NumberField({ label, unit, value, onChange }: { label: string; unit?: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] text-secondary">{label}{unit ? ` (${unit})` : ''}</span>
      <input className="field num" inputMode="decimal" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
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

export function HelpNote() {
  return (
    <p className="text-[13px] leading-relaxed text-secondary">
      If food or weight feels hard, you can talk to someone. ROS, advice on eating disorders:{' '}
      <a className="font-semibold text-accent-2" href="tel:+4794817818">948 17 818</a>,{' '}
      <a className="font-semibold text-accent-2" href="https://www.nettros.no" target="_blank" rel="noreferrer">nettros.no</a>. Your GP can help too.
    </p>
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

  const [sex, setSex] = useState<Sex | null>(null);
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState<ActivityLevel>('active');

  const [goalType, setGoalType] = useState<GoalType>('maintain');
  const [pace, setPace] = useState('0');
  const [targetWeight, setTargetWeight] = useState('');
  const [edits, setEdits] = useState<Partial<Record<'kcal' | 'protein' | 'carbs' | 'fat' | 'fibre', string>>>({});
  const [showHelp, setShowHelp] = useState(false);

  const profile = { age: toNumber(age), height_cm: toNumber(height), weight_kg: toNumber(weight) };
  const profileIssue = profileProblem(profile);
  const paceValue = toNumber(pace);
  const targets = useMemo(
    () =>
      sex && !profileIssue && Number.isFinite(paceValue) && paceValue >= 0
        ? calculateTargets({ sex, ...profile, activity_level: activity, goal_type: goalType, pace_kg_per_week: goalType === 'maintain' ? 0 : paceValue })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sex, age, height, weight, activity, goalType, pace],
  );

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
          <div className="flex h-28 w-28 items-center justify-center rounded-[32px] bg-accent text-[64px] font-bold text-ground">M</div>
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
        <div className="mt-4 rounded-[20px] border border-border bg-card p-4 text-[14px] leading-relaxed text-[#C8C8CC]">
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
    const under18 = profileIssue === 'under_18' && age.trim() !== '';
    return (
      <Page>
        <Progress step="about" back={hasConsent ? null : () => setStep('consent')} />
        <h1 className="pt-4 text-[30px] font-bold leading-tight tracking-[-0.02em]">About you</h1>
        <div className={`mt-4 ${FULL_CHIPS}`}>
          <Chip selected={sex === 'male'} onClick={() => setSex('male')}>Male</Chip>
          <Chip selected={sex === 'female'} onClick={() => setSex('female')}>Female</Chip>
        </div>
        <p className="mt-1.5 text-[12px] text-secondary">Used only for the calorie estimate</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <NumberField label="Age" value={age} onChange={setAge} />
          <NumberField label="Height" unit="cm" value={height} onChange={setHeight} />
          <NumberField label="Weight" unit="kg" value={weight} onChange={setWeight} />
        </div>
        {under18 && (
          <div className="mt-3">
            <Notice>Makro is for people aged 18 and up.</Notice>
            <div className="mt-2"><HelpNote /></div>
          </div>
        )}
        <p className="mt-4 text-[13px] text-secondary">How active are you?</p>
        <div className="mt-2 flex flex-col gap-2">
          {ACTIVITY.map((a) => (
            <button
              key={a.value}
              type="button"
              aria-pressed={activity === a.value}
              onClick={() => setActivity(a.value)}
              className={`rounded-2xl bg-card p-4 text-left text-[15px] font-semibold ${activity === a.value ? 'border-[1.5px] border-accent' : 'border border-border'}`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="mt-auto pb-6 pt-4">
          <PrimaryButton disabled={!sex || profileIssue !== null} onClick={() => setStep('goals')}>Continue</PrimaryButton>
        </div>
      </Page>
    );
  }

  const value = (key: 'kcal' | 'protein' | 'carbs' | 'fat' | 'fibre', calc: number | undefined) => edits[key] ?? (calc === undefined ? '' : String(calc));
  const kcal = value('kcal', targets?.kcal_target);
  const protein = value('protein', targets?.protein_g_target);
  const carbs = value('carbs', targets?.carbs_g_target);
  const fat = value('fat', targets?.fat_g_target);
  const fibre = value('fibre', targets?.fibre_g_target);
  const numbers = [kcal, protein, carbs, fat, fibre].map(toNumber);
  const numbersOk = numbers.every((n) => Number.isFinite(n) && n >= 0);
  const target = targetWeight.trim() === '' ? null : toNumber(targetWeight);
  const targetOk = target === null || (Number.isFinite(target) && target >= 30 && target <= 400);
  const problem = sex && numbersOk ? goalProblem({ sex, goal_type: goalType, kcal_target: numbers[0], pace_kg_per_week: goalType === 'maintain' ? 0 : paceValue }) : null;
  const paceOk = goalType === 'maintain' || (Number.isFinite(paceValue) && paceValue > 0);
  const canSave = !!sex && !!targets && numbersOk && targetOk && paceOk && !problem && !busy;

  const save = () =>
    run(async () => {
      if (!sex) return;
      const at = new Date();
      const tz = browserTimeZone();
      await app.finishSetup({
        goal: buildGoal({
          targets: { kcal_target: numbers[0], protein_g_target: numbers[1], carbs_g_target: numbers[2], fat_g_target: numbers[3], fibre_g_target: numbers[4] },
          goal_type: goalType,
          target_weight_kg: goalType === 'maintain' ? null : target,
          pace_kg_per_week: goalType === 'maintain' ? 0 : paceValue,
          sex,
          birth_year: at.getFullYear() - profile.age,
          height_cm: profile.height_cm,
          activity_level: activity,
          weight_kg: profile.weight_kg,
          at,
          tz,
        }),
        weight: buildWeightEntry({ weight_kg: profile.weight_kg, at, tz }),
      });
    });

  return (
    <Page>
      <Progress step="goals" back={() => setStep('about')} />
      <h1 className="pt-3 text-[30px] font-bold leading-tight tracking-[-0.02em]">Your goals</h1>
      <div className={`mt-4 ${FULL_CHIPS}`}>
        {GOAL_TYPES.map((g) => (
          <Chip
            key={g.value}
            selected={goalType === g.value}
            onClick={() => {
              setGoalType(g.value);
              setPace(String(g.pace));
              setEdits({});
            }}
          >
            {g.label}
          </Chip>
        ))}
      </div>
      {goalType !== 'maintain' && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <NumberField label="Target weight" unit="kg, optional" value={targetWeight} onChange={setTargetWeight} />
          <NumberField label="Pace" unit="kg / week" value={pace} onChange={(v) => { setPace(v); setEdits({}); }} />
        </div>
      )}
      <div className="mt-3"><NumberField label="Daily calories" unit="kcal" value={kcal} onChange={(v) => setEdits({ ...edits, kcal: v })} /></div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <NumberField label="Protein" unit="g" value={protein} onChange={(v) => setEdits({ ...edits, protein: v })} />
        <NumberField label="Carbs" unit="g" value={carbs} onChange={(v) => setEdits({ ...edits, carbs: v })} />
        <NumberField label="Fat" unit="g" value={fat} onChange={(v) => setEdits({ ...edits, fat: v })} />
        <NumberField label="Fibre" unit="g" value={fibre} onChange={(v) => setEdits({ ...edits, fibre: v })} />
      </div>
      {problem === 'below_floor' && sex && <div className="mt-3"><Notice>Makro doesn't set goals under {kcalFloor(sex)} kcal a day.</Notice></div>}
      {problem === 'pace_too_fast' && <div className="mt-3"><Notice>Makro doesn't set a pace above {GOAL_CONSTANTS.max_loss_kg_per_week} kg a week.</Notice></div>}
      {targets?.floored && !problem && edits.kcal === undefined && <div className="mt-3"><Notice>This is the lowest goal Makro sets for you.</Notice></div>}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <p className="mt-3 text-center text-[12px] text-secondary">
        An estimate you can change.{' '}
        <button type="button" className="font-semibold text-accent-2" onClick={() => setShowHelp(!showHelp)}>Need help?</button>
      </p>
      {showHelp && <div className="mt-2"><HelpNote /></div>}
      <div className="mt-auto pb-6 pt-4">
        <PrimaryButton disabled={!canSave} onClick={() => void save()}>Start logging</PrimaryButton>
      </div>
    </Page>
  );
}
