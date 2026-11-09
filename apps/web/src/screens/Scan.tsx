// Scan barcode (B_Scan): the phone camera through the browser's BarcodeDetector. Where the browser
// cannot scan, this route is simply Type the code. The camera runs only while this screen is
// open and the page is visible; leaving the screen unmounts it and turns the camera off.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { barcodeDestination } from '../data/barcodeResult';
import { href, navigate, useApp, useAppState } from '../lib/hooks';
import { browserScanEnv, scanSupport, startScan, type ScanError, type ScanSession } from '../lib/scanner';
import { Notice, Page, SecondaryButton } from '../ui/kit';
import { TypeCode } from './TypeCode';

const CAMERA_PROBLEM: Record<ScanError, string> = {
  denied: 'Makro is not allowed to use the camera. Allow it in your browser settings, or type the code.',
  'no-camera': 'No camera was found on this device. Type the code instead.',
  busy: 'Another app is using the camera. Close it and try again, or type the code.',
  failed: 'The camera could not start. Try again, or type the code.',
};

export function Scan() {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void scanSupport().then((s) => live && setSupported(s));
    return () => {
      live = false;
    };
  }, []);
  if (supported === null) return <Page><div className="flex-1" aria-busy="true" /></Page>;
  return supported ? <Camera /> : <TypeCode />;
}

function usePageVisible(): boolean {
  return useSyncExternalStore(
    (fn) => {
      document.addEventListener('visibilitychange', fn);
      return () => document.removeEventListener('visibilitychange', fn);
    },
    () => document.visibilityState === 'visible',
  );
}

function Corner({ className }: { className: string }) {
  return <div className={`absolute h-11 w-11 border-accent ${className}`} aria-hidden="true" />;
}

function Camera() {
  const app = useApp();
  const { products } = useAppState();
  const visible = usePageVisible();
  const video = useRef<HTMLVideoElement>(null);
  const session = useRef<ScanSession | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [torch, setTorch] = useState({ available: false, on: false });
  const active = products.status === 'ready' && visible && problem === null;

  useEffect(() => {
    const element = video.current;
    if (!active || !element) return;
    let live = true;
    const current = startScan({
      env: browserScanEnv(),
      video: element,
      onReady: (info) => setTorch({ available: info.torch, on: false }),
      onError: (kind) => setProblem(CAMERA_PROBLEM[kind]),
      onCode: (raw) => {
        barcodeDestination(app.db, raw).then(
          (route) => {
            if (!live) return;
            if (route) navigate(route);
            else setProblem('That was not a food barcode. Try again, or type the code.');
          },
          (e) => live && setProblem(e instanceof Error ? e.message : String(e)),
        );
      },
    });
    session.current = current;
    return () => {
      live = false;
      current.stop();
      session.current = null;
    };
  }, [active, app]);

  async function toggleTorch() {
    const on = !torch.on;
    if (await session.current?.setTorch(on)) setTorch((t) => ({ ...t, on }));
  }

  return (
    <Page>
      <div className="fixed inset-0 -z-10 bg-[linear-gradient(165deg,#1B1B1E_0%,#0D0D0E_70%)]" aria-hidden="true" />
      <header className="flex items-center gap-2 pt-2">
        <a href={href('today')} aria-label="Close scanner" className="tap -ml-2 flex h-11 w-11 items-center justify-center rounded-full">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </a>
        <h1 className="flex-1 text-2xl font-bold tracking-[-0.02em]">Scan barcode</h1>
        {torch.available && (
          <button
            type="button"
            aria-label="Torch"
            aria-pressed={torch.on}
            onClick={() => void toggleTorch()}
            className={`tap flex h-11 w-11 items-center justify-center rounded-full border bg-raised ${torch.on ? 'border-accent text-accent' : 'border-border'}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 3L5 14h6l-1 7 8-11h-6z" /></svg>
          </button>
        )}
      </header>

      <div className="relative mx-auto mt-[clamp(32px,10dvh,120px)] h-[190px] w-full max-w-[300px]">
        <video ref={video} className="absolute inset-0 h-full w-full rounded-2xl bg-black/30 object-cover" autoPlay muted playsInline aria-hidden="true" />
        <Corner className="left-0 top-0 rounded-tl-2xl border-l-4 border-t-4" />
        <Corner className="right-0 top-0 rounded-tr-2xl border-r-4 border-t-4" />
        <Corner className="bottom-0 left-0 rounded-bl-2xl border-b-4 border-l-4" />
        <Corner className="bottom-0 right-0 rounded-br-2xl border-b-4 border-r-4" />
        <div className="absolute inset-x-3.5 top-[94px] h-0.5 rounded-sm bg-accent shadow-[0_0_14px_2px_rgba(255,76,0,0.6)]" aria-hidden="true" />
      </div>

      <div className="mx-4 mt-7 text-center">
        {problem ? (
          <div className="flex flex-col gap-2">
            <Notice tone="error">{problem}</Notice>
            <SecondaryButton onClick={() => setProblem(null)}>Try again</SecondaryButton>
          </div>
        ) : products.status === 'loading' ? (
          <Notice>{products.message}...</Notice>
        ) : products.status === 'error' ? (
          <Notice tone="error">
            The food database could not be loaded: {products.message}. You can still{' '}
            <a href={href('custom')} className="font-semibold underline">add a custom food</a>.
          </Notice>
        ) : (
          <div className="text-lg font-semibold">Point at the barcode</div>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-3">
        <SecondaryButton href={href('code')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="mr-2" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="3" /><path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" /></svg>
          Type the code
        </SecondaryButton>
        <a href={href('add')} className="flex h-[52px] items-center justify-center text-[15px] font-semibold text-accent-2">Search by name instead</a>
      </div>
    </Page>
  );
}
