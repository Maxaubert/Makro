// The phone camera and the browser's BarcodeDetector, without React so it can be tested in Node.
// The camera is on only between startScan() and stop(); a code that is accepted also stops it.
//
// Support is narrow: on phones, Chrome and Samsung Internet on Android have the API. Safari, every
// iPhone browser (all WebKit) and Firefox do not, so those users type the code. See apps/web/README.md.
// getUserMedia also needs https (or localhost).

/**
 * EAN-13, EAN-8 and UPC-A only. UPC-E is left out on purpose: it is a compressed 6-8 digit form,
 * and canonicalEan would pad it like an EAN-8 and could find the wrong product.
 */
export const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a'] as const;

const SCAN_LENGTHS = [8, 12, 13];
const READ_EVERY_MS = 200;
const HAVE_CURRENT_DATA = 2;
/** About two seconds of failed reads in a row: this detector will not work here. */
const MAX_FAILED_READS = 10;

interface DetectedCode {
  rawValue: string;
}

interface Detector {
  detect(source: unknown): Promise<DetectedCode[]>;
}

interface DetectorClass {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
}

interface CameraTrack {
  stop(): void;
  getCapabilities?(): object;
  applyConstraints?(constraints: MediaTrackConstraints): Promise<void>;
}

interface CameraStream {
  getTracks(): CameraTrack[];
  getVideoTracks(): CameraTrack[];
}

export interface ScanEnv {
  BarcodeDetector?: DetectorClass;
  mediaDevices?: { getUserMedia?(constraints: MediaStreamConstraints): Promise<CameraStream> };
}

/** The real browser. Undefined members mean the browser does not have them. */
export function browserScanEnv(): ScanEnv {
  return {
    BarcodeDetector: (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector,
    mediaDevices: typeof navigator === 'undefined' ? undefined : navigator.mediaDevices,
  };
}

/** Quick check for choosing a label or a link. scanSupport() has the final say. */
export function canTryScan(env: ScanEnv = browserScanEnv()): boolean {
  return Boolean(env.BarcodeDetector && env.mediaDevices?.getUserMedia);
}

/** True when this browser has the API, a camera API and a decoder for food barcodes. */
export async function scanSupport(env: ScanEnv = browserScanEnv()): Promise<boolean> {
  if (!env.BarcodeDetector || !canTryScan(env)) return false;
  try {
    const formats = await env.BarcodeDetector.getSupportedFormats();
    return SCAN_FORMATS.some((f) => formats.includes(f));
  } catch {
    return false;
  }
}

export type ScanError = 'denied' | 'no-camera' | 'busy' | 'failed';

function errorKind(e: unknown): ScanError {
  switch ((e as { name?: string } | null)?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'no-camera';
    case 'NotReadableError':
      return 'busy';
    default:
      return 'failed';
  }
}

function isFoodBarcode(raw: string): boolean {
  return /^\d+$/.test(raw) && SCAN_LENGTHS.includes(raw.length);
}

export interface ScanSession {
  /** Turns the camera off. Safe at any moment, also before the permission answer, and twice. */
  stop(): void;
  /** Resolves to whether the torch took the setting. */
  setTorch(on: boolean): Promise<boolean>;
}

export function startScan(options: {
  env: ScanEnv;
  video: { srcObject: unknown; readyState: number; play(): Promise<void> };
  onCode(raw: string): void;
  onError(kind: ScanError): void;
  onReady(info: { torch: boolean }): void;
}): ScanSession {
  const { env, video, onCode, onError, onReady } = options;
  let stopped = false;
  let stream: CameraStream | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastRead: string | null = null;
  let failedReads = 0;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  };

  const giveUp = (kind: ScanError) => {
    stop();
    onError(kind);
  };

  const read = async (detector: Detector) => {
    if (video.readyState >= HAVE_CURRENT_DATA) {
      try {
        const found = await detector.detect(video);
        if (stopped) return;
        failedReads = 0;
        const raw = found.map((c) => c.rawValue).find(isFoodBarcode);
        if (raw !== undefined) {
          // A code counts once two reads agree, so one misread frame cannot pick a wrong product.
          if (raw === lastRead) {
            stop();
            onCode(raw);
            return;
          }
          lastRead = raw;
        }
      } catch {
        if (stopped) return;
        if (++failedReads >= MAX_FAILED_READS) {
          giveUp('failed');
          return;
        }
      }
    }
    timer = setTimeout(() => void read(detector), READ_EVERY_MS);
  };

  const begin = async () => {
    try {
      if (!env.BarcodeDetector || !env.mediaDevices?.getUserMedia) throw new Error('no scanner');
      const opened = await env.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (stopped) {
        // The screen was left while the permission question was open.
        opened.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = opened;
      video.srcObject = opened;
      const detector = new env.BarcodeDetector({ formats: [...SCAN_FORMATS] });
      await video.play();
      if (stopped) return;
      const caps = opened.getVideoTracks()[0]?.getCapabilities?.() as { torch?: boolean } | undefined;
      onReady({ torch: caps?.torch === true });
      void read(detector);
    } catch (e) {
      if (!stopped) giveUp(errorKind(e));
    }
  };

  void begin();

  return {
    stop,
    async setTorch(on) {
      const track = stream?.getVideoTracks()[0];
      if (!track?.applyConstraints) return false;
      try {
        await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
        return true;
      } catch {
        return false;
      }
    },
  };
}
