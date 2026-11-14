// Withdraw consent by deleting the account (B6's sheet). Used from Account and from the consent step.
import { useState } from 'react';
import { Notice, SecondaryButton } from '../ui/kit';
import { useDeleteAccount } from './accountActions';

export function DeleteAccount() {
  const [asking, setAsking] = useState(false);
  const { busy, error, remove } = useDeleteAccount();

  if (!asking) return <SecondaryButton onClick={() => setAsking(true)}>Withdraw consent and delete my data</SecondaryButton>;
  return (
    <div className="rounded-[20px] border border-border bg-card p-4" role="group" aria-label="Delete account and data">
      <h2 className="text-[20px] font-bold">Delete account and data?</h2>
      <p className="mt-2 text-[14px] text-secondary">Removes your log, weight, goals and account here and on the server. This cannot be undone.</p>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-4 flex gap-2">
        <button type="button" className="h-14 rounded-full border border-border bg-raised px-5 text-[15px] font-semibold" onClick={() => setAsking(false)}>Cancel</button>
        <button type="button" disabled={busy} className="h-14 flex-1 rounded-full bg-danger text-[16px] font-bold text-white disabled:opacity-50" onClick={() => void remove()}>Delete everything</button>
      </div>
    </div>
  );
}
