// React glue: the App instance, its state, hash routing and re-reading data after changes.
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { App, AppState } from './app';

export const AppContext = createContext<App | null>(null);

export function useApp(): App {
  const app = useContext(AppContext);
  if (!app) throw new Error('AppContext missing');
  return app;
}

export function useAppState(): AppState {
  const app = useApp();
  return useSyncExternalStore(app.subscribe, app.getState);
}

/**
 * Runs an async read and re-runs it when its deps change or local data changes
 * (a save, or a sync that pulled rows). `data` is undefined until the first result.
 */
export function useData<T>(read: () => Promise<T>, deps: unknown[]): { data: T | undefined; error: string | null } {
  const { dataVersion } = useAppState();
  const [state, setState] = useState<{ data: T | undefined; error: string | null }>({ data: undefined, error: null });
  useEffect(() => {
    let live = true;
    read().then(
      (data) => live && setState({ data, error: null }),
      (e) => live && setState((s) => ({ data: s.data, error: e instanceof Error ? e.message : String(e) })),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, dataVersion]);
  return state;
}

// ---- layout: the one place that decides phone or desktop.

export const DESKTOP_MIN_WIDTH = 1024;
const DESKTOP_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH}px)`;

/** True from DESKTOP_MIN_WIDTH up: the D Night screens replace the phone column. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore((fn) => {
    const media = window.matchMedia(DESKTOP_QUERY);
    media.addEventListener('change', fn);
    return () => media.removeEventListener('change', fn);
  }, () => window.matchMedia(DESKTOP_QUERY).matches);
}

// ---- hash routing: #/today, #/diary/2026-10-25, #/portion/product/<id> ...

function currentPath(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : '/today';
}

export function useRoute(): string[] {
  const path = useSyncExternalStore(
    (fn) => {
      window.addEventListener('hashchange', fn);
      return () => window.removeEventListener('hashchange', fn);
    },
    currentPath,
  );
  return path.split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
}

export function useQueryParam(name: string): string | null {
  const path = useSyncExternalStore(
    (fn) => {
      window.addEventListener('hashchange', fn);
      return () => window.removeEventListener('hashchange', fn);
    },
    currentPath,
  );
  const q = path.split('?')[1];
  return q ? new URLSearchParams(q).get(name) : null;
}

export function href(...parts: string[]): string {
  return '#/' + parts.map(encodeURIComponent).join('/');
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  const url = to.startsWith('#') ? to : `#${to}`;
  if (opts.replace) window.location.replace(url);
  else window.location.hash = url.slice(1);
}

export function useBack(fallback: string): () => void {
  return useCallback(() => {
    if (window.history.length > 1) window.history.back();
    else navigate(fallback, { replace: true });
  }, [fallback]);
}
