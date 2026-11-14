// Account: who is signed in, sync and food database status, sign out.
import { href, useApp, useAppState, useData } from '../lib/hooks';
import { APP_VERSION } from '../lib/app';
import { Card, Notice, Page, SecondaryButton, SyncPill } from '../ui/kit';
import { Glyph, type GlyphName } from '../ui/icons-weight-goals-profile';
import { aboutSummary, goalsSummary } from '../domain/goalForm';
import { useDataActions } from './accountActions';
import { DeleteAccount } from './DeleteAccount';
import { HelpNote, loadGoal } from './goalFields';

export function Account() {
  const app = useApp();
  const { session, sync, pending, products } = useAppState();
  const { data: rejected } = useData(() => app.db.rejected(), []);
  const { popular, togglePopular, download, dataError } = useDataActions();
  const { data: goal } = useData(() => loadGoal(app.db), []);

  const row = (icon: GlyphName, label: string, value: string) => (
    <div className="flex items-center justify-between gap-4 border-t border-border py-3 first:border-t-0">
      <span className="flex items-center gap-2.5 text-secondary">
        <Glyph name={icon} size={18} />
        {label}
      </span>
      <span className="min-w-0 truncate text-right">{value}</span>
    </div>
  );

  return (
    <Page nav>
      <header className="flex items-center justify-between pt-2">
        <h1 className="text-[28px] font-bold tracking-[-0.02em]">Account</h1>
        <SyncPill sync={sync} pending={pending} />
      </header>
      <Card className="mt-4 overflow-hidden">
        <a href={href('profile', 'about')} className="tap flex items-center justify-between gap-4 p-4">
          <span className="text-[16px] font-semibold">About you</span>
          <span className="text-right text-[14px] text-secondary">{goal === undefined ? '' : aboutSummary(goal, new Date().getFullYear())}</span>
        </a>
        <a href={href('profile', 'goals')} className="tap flex items-center justify-between gap-4 border-t border-border p-4">
          <span className="text-[16px] font-semibold">Goals</span>
          <span className="text-right text-[14px] text-secondary">{goal === undefined ? '' : goalsSummary(goal)}</span>
        </a>
      </Card>
      <Card className="mt-3 px-4 py-1 text-[15px]">
        {row('mail', 'Email', session?.user.email ?? '')}
        {row('cloud', 'Last synced', sync.lastSyncedAt ? sync.lastSyncedAt.toLocaleTimeString('en-GB') : 'Not yet')}
        {row('database', 'Food database', products.status === 'ready' ? `${products.meta.db_version} (${products.meta.variant ?? 'full'})` : products.status === 'loading' ? 'Loading' : 'Not available')}
        {row('app', 'App', APP_VERSION)}
      </Card>
      {products.status === 'ready' && products.note && <div className="mt-3"><Notice>{products.note}</Notice></div>}
      {sync.error && <div className="mt-3"><Notice tone="error">Last sync failed: {sync.error}</Notice></div>}
      {rejected && rejected.length > 0 && (
        <div className="mt-3">
          <Notice tone="error">
            {rejected.length} {rejected.length === 1 ? 'change' : 'changes'} refused: {rejected[0].reason}{' '}
            <button type="button" className="font-semibold text-text underline underline-offset-2" onClick={() => void app.db.clearRejected().then(() => app.changed())}>
              Dismiss
            </button>
          </Notice>
        </div>
      )}
      <h2 className="mt-6 text-[16px] font-bold">Your data</h2>
      <Card className="mt-2 px-4 py-1 text-[15px]">
        <button
          type="button"
          role="switch"
          aria-checked={popular === true}
          aria-label="Count toward popular foods"
          disabled={popular === null}
          onClick={() => void togglePopular()}
          className="flex w-full items-center justify-between gap-4 py-3 text-left disabled:opacity-50"
        >
          <span>Count toward popular foods</span>
          <span className={`relative h-[26px] w-11 flex-none rounded-full ${popular ? 'bg-accent' : 'bg-strong'}`}>
            <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-ground ${popular ? 'left-[21px]' : 'left-[3px]'}`} />
          </span>
        </button>
      </Card>
      {dataError && <div className="mt-3"><Notice tone="error">{dataError}</Notice></div>}
      <div className="mt-3 flex flex-col gap-2">
        <SecondaryButton onClick={() => void download()}>Download my data</SecondaryButton>
        <SecondaryButton href={href('privacy')}>Privacy notice</SecondaryButton>
        <DeleteAccount />
      </div>
      <div className="mt-4"><HelpNote /></div>
      <div className="mt-6 flex flex-col gap-2">
        <SecondaryButton onClick={() => void app.scheduler.runNow()}>Sync now</SecondaryButton>
        <SecondaryButton onClick={() => void app.signOut()}>Sign out</SecondaryButton>
      </div>
    </Page>
  );
}
