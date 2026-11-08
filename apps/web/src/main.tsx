import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { App as Services } from './lib/app';
import { AppContext } from './lib/hooks';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

let services: Services | null = null;
let startError: string | null = null;
try {
  services = new Services();
} catch (e) {
  startError = e instanceof Error ? e.message : String(e);
}

createRoot(root).render(
  <StrictMode>
    {services ? (
      <AppContext.Provider value={services}>
        <App />
      </AppContext.Provider>
    ) : (
      <main className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-2xl font-bold">Makro is not configured</h1>
        <p className="mt-2 text-secondary">{startError}</p>
      </main>
    )}
  </StrictMode>,
);
