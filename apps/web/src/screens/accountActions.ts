// What the Account screens do with your data, shared by the phone screen and D_Profile.
import { useState } from 'react';
import { useApp, useData } from '../lib/hooks';

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function useDataActions() {
  const app = useApp();
  const [popularChange, setPopularChange] = useState<boolean | null>(null);
  const { data: popularOn } = useData(() => app.popularityOn(), []);
  const popular = popularChange ?? popularOn ?? null;
  const [dataError, setDataError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  async function togglePopular() {
    if (popular === null) return;
    setDataError(null);
    try {
      await app.setPopularity(!popular);
      setPopularChange(!popular);
    } catch (e) {
      setDataError(message(e));
    }
  }

  async function download() {
    setDataError(null);
    setDownloaded(false);
    try {
      const url = URL.createObjectURL(new Blob([await app.exportData()], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'makro-data.json';
      a.click();
      URL.revokeObjectURL(url);
      setDownloaded(true);
    } catch (e) {
      setDataError(message(e));
    }
  }

  return { popular, togglePopular, download, downloaded, dataError };
}

export function useDeleteAccount() {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await app.deleteAccount();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return { busy, error, remove };
}
