// The main-thread side of on-device speech (decision 51): records the microphone, turns it into 16 kHz mono
// samples, and asks the Whisper worker for text. The worker and the model load only when first used.
import type { WhisperIn, WhisperOut } from '../worker/whisper.worker';

const READY_KEY = 'makro.voice.model-ready';

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>();
let loading: Promise<void> | null = null;
const listeners = new Set<(p: { loaded: number; total: number }) => void>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../worker/whisper.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<WhisperOut>) => {
    const m = e.data;
    if (m.type === 'progress') listeners.forEach((l) => l(m));
    if (m.type === 'text') {
      waiting.get(m.id)?.resolve(m.text);
      waiting.delete(m.id);
    }
    if (m.type === 'error') {
      const err = new Error(m.message);
      waiting.forEach((w) => w.reject(err));
      waiting.clear();
    }
  };
  return worker;
}

/** True once the model was downloaded on this browser (it then loads from the cache, no download). */
export function modelDownloaded(): boolean {
  try {
    return localStorage.getItem(READY_KEY) === '1';
  } catch {
    return false;
  }
}

/** Download (first time) and load the model. onProgress gets bytes so far and in all. */
export function loadSpeechModel(onProgress?: (p: { loaded: number; total: number }) => void): Promise<void> {
  if (onProgress) listeners.add(onProgress);
  loading ??= new Promise<void>((resolve, reject) => {
    const w = getWorker();
    const done = (e: MessageEvent<WhisperOut>) => {
      if (e.data.type === 'ready') {
        w.removeEventListener('message', done);
        try {
          localStorage.setItem(READY_KEY, '1');
        } catch {
          // Only a hint for the next visit.
        }
        resolve();
      } else if (e.data.type === 'error') {
        w.removeEventListener('message', done);
        loading = null;
        reject(new Error(e.data.message));
      }
    };
    w.addEventListener('message', done);
    w.postMessage({ type: 'load' } satisfies WhisperIn);
  });
  return loading.finally(() => {
    if (onProgress) listeners.delete(onProgress);
  });
}

export async function transcribe(audio: Float32Array, language: 'norwegian' | 'english'): Promise<string> {
  await loadSpeechModel();
  const id = nextId++;
  return new Promise<string>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    getWorker().postMessage({ type: 'transcribe', id, audio, language } satisfies WhisperIn, [audio.buffer]);
  });
}

/** Records until stop() is called, then returns 16 kHz mono samples (what Whisper expects). */
export async function startRecording(): Promise<{ stop: () => Promise<Float32Array> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.start();
  return {
    stop: () =>
      new Promise<Float32Array>((resolve, reject) => {
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          try {
            const bytes = await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer();
            const ctx = new AudioContext({ sampleRate: 16_000 });
            const decoded = await ctx.decodeAudioData(bytes);
            await ctx.close();
            resolve(toMono(decoded));
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        };
        recorder.stop();
      }),
  };
}

function toMono(b: AudioBuffer): Float32Array {
  if (b.numberOfChannels === 1) return b.getChannelData(0).slice();
  const out = new Float32Array(b.length);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) out[i] += d[i] / b.numberOfChannels;
  }
  return out;
}
