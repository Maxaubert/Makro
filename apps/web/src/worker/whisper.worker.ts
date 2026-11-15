/// <reference lib="webworker" />
// Speech to text on this device (decision 51): the National Library of Norway's Whisper model
// (NbAiLab/nb-whisper-small, ONNX by onnx-community), run by transformers.js inside this worker. Used where
// the browser has no speech recognition of its own (Firefox, Zen). The model downloads once (about 285 MB)
// into the browser's cache; audio never leaves the device and there is no cost.
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

export const WHISPER_MODEL = 'onnx-community/nb-whisper-small-ONNX';

export type WhisperIn = { type: 'load' } | { type: 'transcribe'; id: number; audio: Float32Array; language: 'norwegian' | 'english' };
export type WhisperOut =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'text'; id: number; text: string }
  | { type: 'error'; message: string };

let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
const post = (m: WhisperOut) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

/** WebGPU only when the browser hands out a real adapter; many PCs and headless browsers have the API but no adapter. */
async function hasGpu(): Promise<boolean> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

function load(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (asr) return asr;
  asr = (async () => {
    if (await hasGpu()) {
      try {
        return await open('webgpu');
      } catch {
        // A GPU that fails to start the model: run on the processor instead.
      }
    }
    return open('wasm');
  })();
  asr.catch(() => {
    asr = null;
  });
  return asr;
}

function open(device: 'webgpu' | 'wasm'): Promise<AutomaticSpeechRecognitionPipeline> {
  const files = new Map<string, { loaded: number; total: number }>();
  return pipeline('automatic-speech-recognition', WHISPER_MODEL, {
    device,
    // 4-bit weights: the smallest files that run on both WebGPU and plain WebAssembly.
    dtype: { encoder_model: 'q4', decoder_model_merged: 'q4' },
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== 'progress' || !p.file) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      post({ type: 'progress', loaded, total });
    },
  }) as Promise<AutomaticSpeechRecognitionPipeline>;
}

self.onmessage = async (e: MessageEvent<WhisperIn>) => {
  try {
    if (e.data.type === 'load') {
      await load();
      post({ type: 'ready' });
      return;
    }
    const { id, audio, language } = e.data;
    const run = await load();
    const out = await run(audio, { language, task: 'transcribe', chunk_length_s: 30 });
    const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim();
    post({ type: 'text', id, text });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
