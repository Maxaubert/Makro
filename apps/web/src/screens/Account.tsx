// Account: who is signed in, sync and food database status, sign out.
import { useApp, useAppState, useData } from '../lib/hooks';
import { APP_VERSION } from '../lib/app';
import { Card, Notice, Page, SecondaryButton, SyncPill } from '../ui/kit';

export function Account() {
  const app = useApp();
  const { session, sync, pending, products } = useAppState();
  const { data: rejected } = useData(() => app.db.rejected(), []);

  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-4 border-t border-border py-3 first:border-t-0">
      <span className="text-secondary">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );

  return (
    <Page nav>
      <header className="flex items-center justify-between pt-2">
        <h1 className="text-[28px] font-bold tracking-[-0.02em]">Account</h1>
        <SyncPill sync={sync} pending={pending} />
      </header>
      <Card className="mt-4 px-4 py-1 text-[15px]">
        {row('Signed in as', session?.user.email ?? '')}
        {row('Waiting to sync', String(pending))}
        {row('Last synced', sync.lastSyncedAt ? sync.lastSyncedAt.toLocaleTimeString('en-GB') : 'Not yet')}
        {row('Food database', products.status === 'ready' ? `${products.meta.db_version} (${products.meta.variant ?? 'full'})` : products.status === 'loading' ? 'Loading' : 'Not available')}
        {row('App', APP_VERSION)}
      </Card>
      {products.status === 'ready' && products.note && <div className="mt-3"><Notice>{products.note}</Notice></div>}
      {sync.error && <div className="mt-3"><Notice tone="error">Last sync failed: {sync.error}</Notice></div>}
      {rejected && rejected.length > 0 && (
        <div className="mt-3">
          <Notice tone="error">
            {rejected.length} change{rejected.length === 1 ? ' was' : 's were'} refused by the server: {rejected[0].reason}
          </Notice>
        </div>
      )}
      <div className="mt-6 flex flex-col gap-2">
        <SecondaryButton onClick={() => void app.scheduler.runNow()}>Sync now</SecondaryButton>
        <SecondaryButton onClick={() => void app.signOut()}>Sign out</SecondaryButton>
      </div>
      <p className="mt-4 text-[12px] text-secondary">Your log stays on this device until it syncs. Signing out keeps it here for next time.</p>
    </Page>
  );
}
