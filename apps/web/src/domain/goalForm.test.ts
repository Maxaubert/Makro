import { describe, expect, it } from 'vitest';
import { loadGolden } from './golden';
import type { StoredGoal } from './entry';
import { aboutSummary, buildGoalChange, canStartAtGoals, emptyGoalForm, evaluateGoalForm, goalsSummary, prefillGoalForm, profileChange, toNumber, withLatestWeight, type GoalForm } from './goalForm';
import type { LimitInput } from './goals';

const at = new Date('2026-11-09T10:00:00.000Z');
const year = 2026;
const row: StoredGoal = {
  id: '0192f000-0000-7000-8000-000000000001', created_at: '2026-10-01T08:00:00.000Z', updated_at: '2026-10-01T08:00:00.000Z', deleted_at: null,
  effective_from: '2026-10-01', goal_type: 'lose',
  kcal_target: 2345, protein_g_target: 170, carbs_g_target: 259, fat_g_target: 70, fibre_g_target: 32,
  target_weight_kg: 78, pace_kg_per_week: 0.5, sex: 'male', birth_year: 1996, height_cm: 182, activity_level: 'active', weight_kg: 81.5,
};

const filled = (over: Partial<GoalForm> = {}): GoalForm => ({
  ...emptyGoalForm(), sex: 'male', age: '30', height: '182', weight: '81.5', ...over,
});

describe('prefill from the latest goal row', () => {
  it('fills every field, age from birth_year', () => {
    const { form, complete } = prefillGoalForm(row, year);
    expect(form).toMatchObject({ sex: 'male', age: '30', height: '182', weight: '81.5', activity: 'active', goalType: 'lose', pace: '0.5', targetWeight: '78' });
    expect(complete).toBe(true);
  });
  it('shows the saved targets, also when they were set by hand', () => {
    const { form, baseline } = prefillGoalForm(row, year);
    expect(evaluateGoalForm(form, baseline).shown).toEqual({ kcal: '2345', protein: '170', carbs: '259', fat: '70', fibre: '32' });
  });
  it('leaves what a phone row does not hold empty, never 0', () => {
    const { form, complete } = prefillGoalForm({ ...row, sex: null, birth_year: null, height_cm: null, weight_kg: null, activity_level: null, target_weight_kg: null, pace_kg_per_week: null }, year);
    expect(form).toMatchObject({ sex: null, age: '', height: '', weight: '', targetWeight: '', pace: '' });
    expect(complete).toBe(false);
  });
  it('starts empty with no goal row', () => {
    const { form, baseline, complete } = prefillGoalForm(null, year);
    expect(form).toEqual(emptyGoalForm());
    expect(baseline).toBeNull();
    expect(complete).toBe(false);
  });
});

describe('editing', () => {
  it('counts an untouched form as unchanged', () => {
    const { form, baseline } = prefillGoalForm(row, year);
    const e = evaluateGoalForm(form, baseline);
    expect(e.canSave).toBe(true);
    expect(e.unchanged).toBe(true);
  });
  it('recalculates the targets when the profile changes', () => {
    const { form, baseline } = prefillGoalForm(row, year);
    const e = evaluateGoalForm({ ...form, weight: '90' }, baseline);
    expect(e.shown.kcal).toBe(String(e.targets?.kcal_target));
    expect(e.shown.protein).toBe('180');
    expect(e.unchanged).toBe(false);
  });
  it('keeps the saved targets when a changed field is put back', () => {
    const { form, baseline } = prefillGoalForm(row, year);
    expect(evaluateGoalForm({ ...form, weight: '81,5' }, baseline).shown.kcal).toBe('2345');
  });
  it('keeps a hand edit over the saved and the calculated number', () => {
    const { form, baseline } = prefillGoalForm(row, year);
    const e = evaluateGoalForm({ ...form, edits: { kcal: '2500' } }, baseline);
    expect(e.shown.kcal).toBe('2500');
    expect(e.unchanged).toBe(false);
  });
  it('a new target weight changes the goal but not the targets', () => {
    const { form, baseline } = prefillGoalForm(row, year);
    const e = evaluateGoalForm({ ...form, targetWeight: '76' }, baseline);
    expect(e.shown.kcal).toBe('2345');
    expect(e.unchanged).toBe(false);
  });
  it('calculates from scratch on a row with missing inputs, and is never unchanged', () => {
    const { form, baseline } = prefillGoalForm({ ...row, activity_level: null }, year);
    const e = evaluateGoalForm(form, baseline);
    expect(e.shown.kcal).toBe(String(e.targets?.kcal_target));
    expect(e.unchanged).toBe(false);
  });
});

describe('macros follow the calories', () => {
  const mismatched: StoredGoal = { ...row, kcal_target: 1900, protein_g_target: 179, carbs_g_target: 283, fat_g_target: 69, fibre_g_target: 30 };

  it('shows shares that add up to 100', () => {
    const { form, baseline } = prefillGoalForm(row, year);
    const e = evaluateGoalForm(form, baseline);
    expect(e.shares).toEqual({ protein: 29, carbs: 44, fat: 27 });
  });
  it('scales the grams when the calories are typed', () => {
    const { form, baseline } = prefillGoalForm(row, year);
    const e = evaluateGoalForm({ ...form, edits: { kcal: '2000' } }, baseline);
    expect(e.shares).toEqual({ protein: 29, carbs: 44, fat: 27 });
    expect(e.shown).toMatchObject({ kcal: '2000', protein: '145', fat: '60', carbs: '220' });
    expect(e.macroKcal).toEqual({ protein: 580, carbs: 880, fat: 540 });
  });
  it('sets the grams from a chosen split', () => {
    const { form, baseline } = prefillGoalForm(row, year);
    const e = evaluateGoalForm({ ...form, shares: { protein: 40, carbs: 30, fat: 30 } }, baseline);
    expect(e.shown).toMatchObject({ kcal: '2345', protein: '235', fat: '78' });
    expect(e.unchanged).toBe(false);
    expect(buildGoalChange({ ...form, shares: { protein: 40, carbs: 30, fat: 30 } }, baseline, at, 'UTC').goal.protein_g_target).toBe(235);
  });
  it('keeps calculated grams when nothing was touched', () => {
    const e = evaluateGoalForm(filled(), null);
    expect(e.shown.protein).toBe(String(e.targets?.protein_g_target));
    expect(e.shown.carbs).toBe(String(e.targets?.carbs_g_target));
  });
  it('repairs a saved goal whose macros do not match its calories, and says so', () => {
    const { form, baseline } = prefillGoalForm(mismatched, year);
    const e = evaluateGoalForm(form, baseline);
    expect(e.shares).toEqual({ protein: 29, carbs: 46, fat: 25 });
    expect(e.shown).toMatchObject({ kcal: '1900', protein: '138', carbs: '218', fat: '53' });
    expect(e.repairedFromKcal).toBe(2469);
    expect(e.unchanged).toBe(false);
    expect(e.canSave).toBe(true);
  });
  it('does not call a goal repaired once it is typed over', () => {
    const { form, baseline } = prefillGoalForm(mismatched, year);
    expect(evaluateGoalForm({ ...form, shares: { protein: 30, carbs: 40, fat: 30 } }, baseline).repairedFromKcal).toBeNull();
  });
  it('tolerates a few kcal of rounding on a saved goal', () => {
    const { form, baseline } = prefillGoalForm(row, year);
    expect(evaluateGoalForm(form, baseline).repairedFromKcal).toBeNull();
  });
  it('leaves the grams empty while the calories are not a number', () => {
    const e = evaluateGoalForm(filled({ edits: { kcal: '' } }), null);
    expect(e.shown).toMatchObject({ protein: '', carbs: '', fat: '' });
    expect(e.canSave).toBe(false);
  });
  it('saves only when the split adds up to 100', () => {
    const { form, baseline } = prefillGoalForm(row, year);
    const over = evaluateGoalForm({ ...form, shares: { protein: 35, carbs: 44, fat: 27 } }, baseline);
    expect(over.sharesTotal).toBe(106);
    expect(over.canSave).toBe(false);
    expect(() => buildGoalChange({ ...form, shares: { protein: 35, carbs: 44, fat: 27 } }, baseline, at, 'UTC')).toThrow();
    const under = evaluateGoalForm({ ...form, shares: { protein: 25, carbs: 44, fat: 27 } }, baseline);
    expect(under.sharesTotal).toBe(96);
    expect(under.canSave).toBe(false);
    expect(evaluateGoalForm({ ...form, shares: { protein: 29, carbs: 44, fat: 27 } }, baseline).canSave).toBe(true);
  });
  it('still shows grams for each share while the total is off', () => {
    const { form, baseline } = prefillGoalForm(row, year);
    const e = evaluateGoalForm({ ...form, edits: { kcal: '2000' }, shares: { protein: 35, carbs: 44, fat: 27 } }, baseline);
    expect(e.shown).toMatchObject({ protein: '175', carbs: '220', fat: '60' });
    expect(e.macroKcal).toEqual({ protein: 700, carbs: 880, fat: 540 });
  });
  it('keeps fibre outside the split', () => {
    const { form, baseline } = prefillGoalForm(row, year);
    expect(evaluateGoalForm({ ...form, edits: { fibre: '40' } }, baseline).shown).toMatchObject({ fibre: '40', protein: '170' });
  });
});

describe('limits cannot be bypassed by editing (#23)', () => {
  const golden = loadGolden<LimitInput, { problem: string | null }>('goals/limits.json');
  const formFor = (c: LimitInput): GoalForm =>
    filled({ sex: c.sex, goalType: c.goal_type, pace: String(c.pace_kg_per_week), edits: { kcal: String(c.kcal_target), fibre: '30' } });

  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const form = formFor(c.input);
    expect(evaluateGoalForm(form, null).problem).toBe(c.expected.problem);
    if (c.expected.problem) expect(() => buildGoalChange(form, null, at, 'UTC')).toThrow();
    else expect(buildGoalChange(form, null, at, 'UTC').goal.kcal_target).toBe(c.input.kcal_target);
  });

  it('blocks a saved kcal that is under the floor after a change of sex', () => {
    const { form, baseline } = prefillGoalForm({ ...row, sex: 'female', kcal_target: 1300 }, year);
    const e = evaluateGoalForm({ ...form, sex: 'male', edits: { kcal: '1300' } }, baseline);
    expect(e.problem).toBe('below_floor');
    expect(e.canSave).toBe(false);
  });
  it('blocks an old row that is already under the floor until it is fixed', () => {
    const { form, baseline } = prefillGoalForm({ ...row, kcal_target: 1000 }, year);
    expect(evaluateGoalForm(form, baseline).canSave).toBe(false);
    expect(() => buildGoalChange(form, baseline, at, 'UTC')).toThrow();
  });
  it('refuses text where a number belongs', () => {
    expect(() => buildGoalChange(filled({ edits: { kcal: 'abc' } }), null, at, 'UTC')).toThrow();
    expect(() => buildGoalChange(filled({ goalType: 'lose', pace: 'fast' }), null, at, 'UTC')).toThrow();
  });
  it('refuses under 18 and an impossible profile', () => {
    expect(() => buildGoalChange(filled({ age: '17' }), null, at, 'UTC')).toThrow();
    expect(() => buildGoalChange(filled({ height: '50' }), null, at, 'UTC')).toThrow();
  });
});

describe('the rows a change writes', () => {
  it('is a goal effective from today, birth year unchanged', () => {
    const { form, baseline } = prefillGoalForm(row, year);
    const { goal } = buildGoalChange({ ...form, edits: { kcal: '2500' } }, baseline, at, 'UTC');
    expect(goal).toMatchObject({ effective_from: '2026-11-09', goal_type: 'lose', kcal_target: 2500, protein_g_target: 181, birth_year: 1996, target_weight_kg: 78 });
    expect(goal.id).not.toBe(row.id);
  });
  it('uses the local day of the time zone', () => {
    const { form, baseline } = prefillGoalForm(row, year);
    const late = new Date('2026-11-09T23:30:00.000Z');
    expect(buildGoalChange({ ...form, edits: { kcal: '2500' } }, baseline, late, 'Europe/Oslo').goal.effective_from).toBe('2026-11-10');
  });
  it('writes a weight entry only when the weight changed', () => {
    const { form, baseline } = prefillGoalForm(row, year);
    expect(buildGoalChange({ ...form, edits: { kcal: '2500' } }, baseline, at, 'UTC').weight).toBeNull();
    expect(buildGoalChange({ ...form, weight: '81,5', edits: { kcal: '2500' } }, baseline, at, 'UTC').weight).toBeNull();
    expect(buildGoalChange({ ...form, weight: '80' }, baseline, at, 'UTC').weight).toMatchObject({ weight_kg: 80, local_date: '2026-11-09', source: 'manual' });
  });
  it('writes a weight when the row held none, and on first run', () => {
    const { form, baseline } = prefillGoalForm({ ...row, weight_kg: null }, year);
    expect(buildGoalChange({ ...form, weight: '81.5' }, baseline, at, 'UTC').weight?.weight_kg).toBe(81.5);
    expect(buildGoalChange(filled(), null, at, 'UTC').weight?.weight_kg).toBe(81.5);
  });
  it('drops pace and target weight on maintain', () => {
    const { form, baseline } = prefillGoalForm(row, year);
    expect(buildGoalChange({ ...form, goalType: 'maintain' }, baseline, at, 'UTC').goal).toMatchObject({ pace_kg_per_week: 0, target_weight_kg: null });
  });
});

describe('the Account rows', () => {
  it('reads like the canvas', () => {
    expect(aboutSummary(row, year)).toBe('30 · 182 cm · 81.5 kg');
    expect(goalsSummary({ ...row, kcal_target: 2400 })).toBe('2,400 kcal');
  });
  it('leaves out what is unknown', () => {
    expect(aboutSummary({ ...row, birth_year: null, weight_kg: null }, year)).toBe('182 cm');
    expect(aboutSummary({ ...row, birth_year: null, height_cm: null, weight_kg: null }, year)).toBe('Not set');
    expect(aboutSummary(null, year)).toBe('Not set');
    expect(goalsSummary(null)).toBe('Not set');
  });
});

describe('review fixes 2026-11-10', () => {
  it('reads thousands separators as the desktop field shows them', () => {
    expect(toNumber('2,200')).toBe(2200);
    expect(toNumber('12,500')).toBe(12500);
    expect(toNumber('2 200')).toBe(2200);
    expect(toNumber('81,5')).toBe(81.5);
    expect(toNumber('0,25')).toBe(0.25);
  });
  it('uses a weight logged after the goal, without writing it again', () => {
    const latest = { weight_kg: 80, measured_at: '2026-11-05T07:00:00.000Z' };
    const goal = withLatestWeight(row, latest);
    expect(goal?.weight_kg).toBe(80);
    expect(aboutSummary(goal, year)).toBe('30 · 182 cm · 80 kg');
    const { form, baseline } = prefillGoalForm(goal, year);
    expect(form.weight).toBe('80');
    const e = evaluateGoalForm(form, baseline);
    expect(e.shown.kcal).toBe('2345');
    expect(e.unchanged).toBe(true);
    expect(buildGoalChange({ ...form, edits: { kcal: '2400' } }, baseline, at, 'UTC').weight).toBeNull();
  });
  it('keeps the goal weight when the latest weight is older than the goal', () => {
    expect(withLatestWeight(row, { weight_kg: 90, measured_at: '2026-09-01T07:00:00.000Z' })?.weight_kg).toBe(81.5);
    expect(withLatestWeight(row, null)?.weight_kg).toBe(81.5);
    expect(withLatestWeight(null, { weight_kg: 90, measured_at: '2026-11-01T07:00:00.000Z' })).toBeNull();
  });
  it('drops typed calories when the profile changes, so the new estimate shows', () => {
    const { form, baseline } = prefillGoalForm(row, year);
    const typed: GoalForm = { ...form, edits: { kcal: '2200', fibre: '35' }, shares: { protein: 40, carbs: 30, fat: 30 } };
    const next = { ...typed, ...profileChange(typed, { weight: '70' }) };
    const e = evaluateGoalForm(next, baseline);
    expect(e.shown.kcal).toBe(String(e.targets?.kcal_target));
    expect(e.shown.fibre).toBe('35');
    expect(e.shares).toEqual({ protein: 40, carbs: 30, fat: 30 });
  });
  it('says why About you cannot continue', () => {
    expect(evaluateGoalForm(filled({ height: '90' }), null).profileIssue).toBe('height');
  });
  it('wants a target below the weight to lose and above it to gain', () => {
    expect(evaluateGoalForm(filled({ goalType: 'lose', pace: '0.5', targetWeight: '120' }), null)).toMatchObject({ targetIssue: 'not_below', canSave: false });
    expect(evaluateGoalForm(filled({ goalType: 'gain', pace: '0.25', targetWeight: '70' }), null)).toMatchObject({ targetIssue: 'not_above', canSave: false });
    expect(evaluateGoalForm(filled({ goalType: 'lose', pace: '0.5', targetWeight: '75' }), null)).toMatchObject({ targetIssue: null, canSave: true });
    expect(evaluateGoalForm(filled({ goalType: 'lose', pace: '0.5', targetWeight: '' }), null).targetIssue).toBeNull();
  });
});

describe('where editing starts', () => {
  it('opens Goals only when the saved profile passes the limits', () => {
    expect(canStartAtGoals(prefillGoalForm(row, year))).toBe(true);
    expect(canStartAtGoals(prefillGoalForm({ ...row, birth_year: 2010 }, year))).toBe(false);
    expect(canStartAtGoals(prefillGoalForm({ ...row, height_cm: 90 }, year))).toBe(false);
    expect(canStartAtGoals(prefillGoalForm({ ...row, sex: null }, year))).toBe(false);
    expect(canStartAtGoals(prefillGoalForm(null, year))).toBe(false);
  });
});
