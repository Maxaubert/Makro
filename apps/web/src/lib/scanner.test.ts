import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canTryScan, scanSupport, startScan, type ScanError, type ScanEnv } from './scanner';

const EAN = '7038010012345';

function fakeTrack(torch = false) {
  return {
    stop: vi.fn(),
    getCapabilities: () => (torch ? { torch: true } : {}),
    applyConstraints: vi.fn(async () => {}),
  };
}

function fakeStream(track = fakeTrack()) {
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
}

/** The camera and detector a browser would give, with each detect() result chosen by the test. */
function rig(opts: { stream?: ReturnType<typeof fakeStream>; getUserMedia?: () => Promise<unknown>; readyState?: number } = {}) {
  const stream = opts.stream ?? fakeStream();
  const getUserMedia = vi.fn(opts.getUserMedia ?? (async () => stream));
  const reads: (string[] | Error)[] = [];
  const detect = vi.fn(async () => {
    const next = reads.shift() ?? [];
    if (next instanceof Error) throw next;
    return next.map((rawValue) => ({ rawValue }));
  });
  const created: { formats: string[] }[] = [];
  class Detector {
    static getSupportedFormats = async () => ['ean_13', 'ean_8', 'upc_a', 'qr_code'];
    constructor(o: { formats: string[] }) {
      created.push(o);
    }
    detect = detect;
  }
  const env = { BarcodeDetector: Detector, mediaDevices: { getUserMedia } } as unknown as ScanEnv;
  const video = { srcObject: null as unknown, readyState: opts.readyState ?? 4, play: vi.fn(async () => {}) };
  const onCode = vi.fn();
  const onError = vi.fn<(kind: ScanError) => void>();
  const onReady = vi.fn();
  return { stream, getUserMedia, reads, detect, created, env, video, onCode, onError, onReady, handlers: { env, video, onCode, onError, onReady } };
}

const tick = (ms = 200) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('scanSupport', () => {
  it('is false without BarcodeDetector (Safari, iPhone browsers, Firefox)', async () => {
    const r = rig();
    await expect(scanSupport({ mediaDevices: r.env.mediaDevices })).resolves.toBe(false);
  });

  it('is false without a camera API (a page that is not https)', async () => {
    const r = rig();
    await expect(scanSupport({ BarcodeDetector: r.env.BarcodeDetector })).resolves.toBe(false);
  });

  it('is false when the device has no EAN decoder', async () => {
    class Qr {
      static getSupportedFormats = async () => ['qr_code'];
    }
    const env = { BarcodeDetector: Qr, mediaDevices: rig().env.mediaDevices } as unknown as ScanEnv;
    await expect(scanSupport(env)).resolves.toBe(false);
  });

  it('is false when asking for the formats fails', async () => {
    class Broken {
      static getSupportedFormats = async () => {
        throw new Error('no');
      };
    }
    const env = { BarcodeDetector: Broken, mediaDevices: rig().env.mediaDevices } as unknown as ScanEnv;
    await expect(scanSupport(env)).resolves.toBe(false);
  });

  it('is true with EAN formats and a camera API', async () => {
    await expect(scanSupport(rig().env)).resolves.toBe(true);
  });
});

describe('canTryScan', () => {
  it('needs both the detector and the camera API', () => {
    const r = rig();
    expect(canTryScan(r.env)).toBe(true);
    expect(canTryScan({ mediaDevices: r.env.mediaDevices })).toBe(false);
    expect(canTryScan({ BarcodeDetector: r.env.BarcodeDetector })).toBe(false);
  });
});

describe('startScan', () => {
  it('asks for the back camera without sound and shows it in the video', async () => {
    const r = rig();
    startScan(r.handlers);
    await tick(0);
    expect(r.getUserMedia.mock.calls[0]).toEqual([
      expect.objectContaining({ audio: false, video: expect.objectContaining({ facingMode: { ideal: 'environment' } }) }),
    ]);
    expect(r.video.srcObject).toBe(r.stream);
    expect(r.video.play).toHaveBeenCalled();
  });

  it('only looks for food barcodes: no UPC-E, which must not be padded like an EAN-8', async () => {
    const r = rig();
    startScan(r.handlers);
    await tick(0);
    expect(r.created[0].formats).toEqual(['ean_13', 'ean_8', 'upc_a']);
  });

  it('accepts a code after two matching reads, once, and stops the camera', async () => {
    const r = rig();
    r.reads.push([EAN], [EAN], [EAN]);
    startScan(r.handlers);
    await tick(0); // the first read
    expect(r.onCode).not.toHaveBeenCalled();
    await tick();
    expect(r.onCode).toHaveBeenCalledTimes(1);
    expect(r.onCode).toHaveBeenCalledWith(EAN);
    expect(r.stream.track.stop).toHaveBeenCalled();
    await tick(1000);
    expect(r.onCode).toHaveBeenCalledTimes(1);
  });

  it('a frame with no barcode between two matching reads is fine', async () => {
    const r = rig();
    r.reads.push([EAN], [], [EAN]);
    startScan(r.handlers);
    await tick(0);
    await tick(600);
    expect(r.onCode).toHaveBeenCalledWith(EAN);
  });

  it('a different read in between starts the count again (a misread never wins)', async () => {
    const r = rig();
    const other = '7038010012346';
    r.reads.push([EAN], [other], [EAN]);
    startScan(r.handlers);
    await tick(0);
    await tick(600);
    expect(r.onCode).not.toHaveBeenCalled();
  });

  it.each([['https://example.com'], ['12345'], ['12345678901234'], ['']])('ignores %j, which is not a food barcode', async (raw) => {
    const r = rig();
    r.reads.push([raw], [raw], [raw]);
    startScan(r.handlers);
    await tick(0);
    await tick(800);
    expect(r.onCode).not.toHaveBeenCalled();
  });

  it.each([['8 digits', '96385074'], ['12 digits', '036000291452'], ['13 digits', EAN]])('accepts %s', async (_l, raw) => {
    const r = rig();
    r.reads.push([raw], [raw]);
    startScan(r.handlers);
    await tick(0);
    await tick(600);
    expect(r.onCode).toHaveBeenCalledWith(raw);
  });

  it('does not read frames until the video has one', async () => {
    const r = rig({ readyState: 0 });
    startScan(r.handlers);
    await tick(0);
    await tick(600);
    expect(r.detect).not.toHaveBeenCalled();
    r.video.readyState = 2;
    await tick(200);
    expect(r.detect).toHaveBeenCalled();
  });

  it('stop() turns the camera off and detaches it from the video', async () => {
    const r = rig();
    const s = startScan(r.handlers);
    await tick(0);
    s.stop();
    expect(r.stream.track.stop).toHaveBeenCalled();
    expect(r.video.srcObject).toBeNull();
    const calls = r.detect.mock.calls.length;
    await tick(1000);
    expect(r.detect.mock.calls.length).toBe(calls);
  });

  it('leaving before the permission answer still turns the camera off when it arrives', async () => {
    let grant: (s: unknown) => void = () => {};
    const r = rig({ getUserMedia: () => new Promise((res) => (grant = res)) });
    const s = startScan(r.handlers);
    await tick(0);
    s.stop();
    grant(r.stream);
    await tick(0);
    expect(r.stream.track.stop).toHaveBeenCalled();
    expect(r.video.srcObject).toBeNull();
    expect(r.onReady).not.toHaveBeenCalled();
    await tick(1000);
    expect(r.detect).not.toHaveBeenCalled();
  });

  it('a read that lands after leaving is dropped', async () => {
    const r = rig();
    let answer: (v: { rawValue: string }[]) => void = () => {};
    r.detect.mockImplementation(() => new Promise((res) => (answer = res)));
    const s = startScan(r.handlers);
    await tick(0);
    s.stop();
    answer([{ rawValue: EAN }]);
    await tick(1000);
    expect(r.onCode).not.toHaveBeenCalled();
  });

  it.each<[string, ScanError]>([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'no-camera'],
    ['OverconstrainedError', 'no-camera'],
    ['NotReadableError', 'busy'],
    ['AbortError', 'failed'],
  ])('%s is reported as %s', async (name, kind) => {
    const r = rig({ getUserMedia: async () => Promise.reject(Object.assign(new Error('x'), { name })) });
    startScan(r.handlers);
    await tick(0);
    expect(r.onError).toHaveBeenCalledWith(kind);
  });

  it('no error is reported after leaving', async () => {
    let refuse: (e: unknown) => void = () => {};
    const r = rig({ getUserMedia: () => new Promise((_res, rej) => (refuse = rej)) });
    const s = startScan(r.handlers);
    await tick(0);
    s.stop();
    refuse(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    await tick(0);
    expect(r.onError).not.toHaveBeenCalled();
  });

  it('a single failed read is ignored', async () => {
    const r = rig();
    r.reads.push(new Error('blurry'), [EAN], [EAN]);
    startScan(r.handlers);
    await tick(0);
    await tick(800);
    expect(r.onError).not.toHaveBeenCalled();
    expect(r.onCode).toHaveBeenCalledWith(EAN);
  });

  it('a detector that keeps failing gives up and turns the camera off', async () => {
    const r = rig();
    r.detect.mockImplementation(async () => {
      throw new Error('broken');
    });
    startScan(r.handlers);
    await tick(0);
    await tick(10_000);
    expect(r.onError).toHaveBeenCalledTimes(1);
    expect(r.onError).toHaveBeenCalledWith('failed');
    expect(r.stream.track.stop).toHaveBeenCalled();
  });

  it('says whether the camera has a torch', async () => {
    const r = rig({ stream: fakeStream(fakeTrack(true)) });
    startScan(r.handlers);
    await tick(0);
    expect(r.onReady).toHaveBeenCalledWith({ torch: true });
    const plain = rig();
    startScan(plain.handlers);
    await tick(0);
    expect(plain.onReady).toHaveBeenCalledWith({ torch: false });
  });

  it('switches the torch through the camera track', async () => {
    const r = rig({ stream: fakeStream(fakeTrack(true)) });
    const s = startScan(r.handlers);
    await tick(0);
    await expect(s.setTorch(true)).resolves.toBe(true);
    expect(r.stream.track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] });
  });

  it('a torch that refuses reports false and scanning goes on', async () => {
    const track = fakeTrack(true);
    track.applyConstraints.mockRejectedValue(new Error('no'));
    const r = rig({ stream: fakeStream(track) });
    r.reads.push([EAN], [EAN]);
    const s = startScan(r.handlers);
    await tick(0);
    await expect(s.setTorch(true)).resolves.toBe(false);
    await tick(600);
    expect(r.onCode).toHaveBeenCalledWith(EAN);
  });
});
