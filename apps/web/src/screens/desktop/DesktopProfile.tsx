// D_Profile: account, profile summary and your data. Uses the same data calls as the phone Account screen.
import { useEffect, useState } from 'react';
import { goalsSummary } from '../../domain/goalForm';
import { formatNumber } from '../../domain/format';
import { ageFromBirthYear } from '../../domain/goals';
import { APP_VERSION } from '../../lib/app';
import { href, useApp, useAppState, useData } from '../../lib/hooks';
import { DesktopShell } from '../../ui/desktop';
import { Icon, Notice } from '../../ui/kit';
import { syncLabel } from '../../ui/syncLabel';
import { useDataActions, useDeleteAccount } from '../accountActions';
import { ACTIVITY, HelpNote, loadGoal } from '../goalFields';

const CARD = 'rounded-[20px] border border-border bg-card p-6';
const CARD_TITLE = 'text-[17px] font-bold';
const ROW = 'flex w-full items-center justify-between gap-4 border-t border-border text-left text-[15px] font-semibold';
const ROW_HINT = 'shrink-0 text-[14px] font-normal text-secondary';

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] bg-raised px-3.5 py-3">
      <div className="text-[12px] text-secondary">{label}</div>
      <div className="mt-0.5 min-h-[23px] truncate text-[18px] font-bold">{value}</div>
    </div>
  );
}

function ConfirmDelete({ onCancel }: { onCancel: () => void }) {
  const { busy, error, remove } = useDeleteAccount();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/[0.62]" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        className="w-[400px] max-w-[calc(100vw-32px)] solid rounded-3xl border border-border bg-card p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-title" className="text-[22px] font-bold">Delete account and data?</h2>
        <p className="mt-2 text-[14px] leading-normal text-secondary">Your log, weight, goals and account are removed from this device and the server. This cannot be undone.</p>
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-6 flex gap-2.5">
          <button type="button" autoFocus className="tap h-[50px] flex-1 rounded-full border border-border bg-raised text-[15px] font-semibold" onClick={onCancel}>Cancel</button>
          <button type="button" disabled={busy} className="tap h-[50px] flex-1 rounded-full bg-danger text-[15px] font-bold text-white disabled:opacity-50" onClick={() => void remove()}>Delete everything</button>
        </div>
      </div>
    </div>
  );
}

export function DesktopProfile() {
  const app = useApp();
  const { session, sync, pending, products } = useAppState();
  const { data: rejected } = useData(() => app.db.rejected(), []);
  const { data: goal } = useData(() => loadGoal(app.db), []);
  const { popular, togglePopular, download, downloaded, dataError } = useDataActions();
  const [confirming, setConfirming] = useState(false);

  const email = session?.user.email ?? '';
  // The account has no display name, so this shows the part of the email before the @, like the sidebar.
  const name = email.split('@')[0] || 'Account';

  // Blank while the goal row loads; "Not set" when the row or the field has no value (missing is never zero).
  const fact = (value: (g: NonNullable<typeof goal>) => string | null): string => {
    if (goal === undefined) return '';
    return (goal && value(goal)) ?? 'Not set';
  };
  const foodDatabase = products.status === 'ready' ? `${products.meta.db_version} (${products.meta.variant ?? 'full'})` : products.status === 'loading' ? 'Loading' : 'Not available';

  return (
    <DesktopShell active="account" subtitle="Account, data and settings" title="Profile">
      <div className="grid grid-cols-2 items-start gap-5">
        <section className="flex flex-col gap-5">
          <div className={CARD}>
            <div className="flex items-center gap-4">
              <span className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full bg-border text-[24px] font-bold" aria-hidden="true">{name[0].toUpperCase()}</span>
              <div className="min-w-0 grow">
                <div className="truncate text-[22px] font-bold">{name}</div>
                <div className="mt-0.5 truncate text-[13px] text-secondary" title={email || undefined}>{email}</div>
              </div>
              <button type="button" onClick={() => void app.signOut()} className="tap flex h-[42px] shrink-0 items-center rounded-full border border-border bg-raised px-[18px] text-[14px] font-semibold">Sign out</button>
            </div>
            <button type="button" onClick={() => void app.scheduler.runNow()} className={`tap ${ROW} mt-[18px] pt-4`}>
              <span className="min-w-0">
                <span className="block">Backup and sync</span>
                <span className="mt-0.5 block truncate text-[12px] font-normal text-secondary">{syncLabel(sync, pending)}</span>
              </span>
              <span className={ROW_HINT}>Sync now</span>
            </button>
            {products.status === 'ready' && products.note && <div className="mt-4"><Notice>{products.note}</Notice></div>}
            {sync.error && <div className="mt-4"><Notice tone="error">Last sync failed: {sync.error}</Notice></div>}
            {rejected && rejected.length > 0 && (
              <div className="mt-4">
                <Notice tone="error">
                  {rejected.length} change{rejected.length === 1 ? ' was' : 's were'} refused by the server: {rejected[0].reason}{' '}
                  <button type="button" className="font-semibold text-text underline underline-offset-2" onClick={() => void app.db.clearRejected().then(() => app.changed())}>
                    Dismiss
                  </button>
                </Notice>
              </div>
            )}
          </div>

          <div className={CARD}>
            <div className="flex items-center justify-between">
              <div className={CARD_TITLE}>Profile</div>
              <a href={href('profile', 'about')} aria-label="Edit about you" className="tap text-[14px] text-secondary hover:text-text">Edit</a>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Fact label="Sex" value={fact((g) => (g.sex === null ? null : g.sex === 'male' ? 'Male' : 'Female'))} />
              <Fact label="Age" value={fact((g) => (g.birth_year === null ? null : String(ageFromBirthYear(g.birth_year, new Date().getFullYear()))))} />
              <Fact label="Height" value={fact((g) => (g.height_cm === null ? null : `${formatNumber(g.height_cm, 1)} cm`))} />
              <Fact label="Activity" value={fact((g) => ACTIVITY.find((a) => a.value === g.activity_level)?.label ?? null)} />
            </div>
            <a href={href('goals')} className="tap mt-3.5 flex items-center justify-between pt-4 text-[15px] font-semibold">
              <span>Goals</span>
              <span className="flex items-center gap-1.5 text-secondary">
                {goal === undefined ? '' : goalsSummary(goal)}
                <Icon name="next" size={16} />
              </span>
            </a>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <div className={CARD}>
            <div className={CARD_TITLE}>Your data</div>
            <button type="button" onClick={() => void download()} className={`tap ${ROW} mt-2 py-4`}>
              <span>Export my data</span>
              <span className={`shrink-0 text-[14px] font-normal ${downloaded ? 'text-[#7FD99A]' : 'text-secondary'}`}>{downloaded ? 'Saved as JSON' : 'JSON file'}</span>
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={popular === true}
              aria-label="Count toward popular foods"
              disabled={popular === null}
              onClick={() => void togglePopular()}
              className={`${ROW} py-4 disabled:opacity-50`}
            >
              <span>Count toward popular foods</span>
              <span className={`relative h-7 w-12 flex-none rounded-full ${popular ? 'bg-accent' : 'bg-strong'}`}>
                <span className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-text ${popular ? 'left-[23px]' : 'left-[3px]'}`} />
              </span>
            </button>
            <a href={href('privacy')} className={`tap ${ROW} py-4`}>
              <span>Privacy notice</span>
              <Icon name="next" size={16} className="shrink-0 text-secondary" />
            </a>
            <button type="button" onClick={() => setConfirming(true)} className={`tap ${ROW} pt-4 text-accent-2`}>
              <span>Delete account and data</span>
              <Icon name="next" size={16} className="shrink-0" />
            </button>
            {dataError && <div className="mt-4"><Notice tone="error">{dataError}</Notice></div>}
            <div className="mt-4 border-t border-border pt-4"><HelpNote /></div>
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-secondary">
            Your log stays on this device until it syncs. Signing out keeps it here for next time.
            <br />
            Food database {foodDatabase}. App {APP_VERSION}.
          </p>
        </section>
      </div>
      {confirming && <ConfirmDelete onCancel={() => setConfirming(false)} />}
    </DesktopShell>
  );
}
