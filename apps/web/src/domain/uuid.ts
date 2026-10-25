// UUIDv7 (RFC 9562), the id format of packages/contracts/log-schema.md: lowercase,
// 36 characters with hyphens, made by the client. 48 bits of Unix milliseconds,
// version 7, 74 random bits with the 10xx variant.

const MAX_MS = 2 ** 48;

function cryptoBytes(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

export function uuidv7(nowMs: number = Date.now(), randomBytes: () => Uint8Array = cryptoBytes): string {
  if (!Number.isInteger(nowMs) || nowMs < 0 || nowMs >= MAX_MS) {
    throw new RangeError(`time must be an integer in [0, 2^48), got ${nowMs}`);
  }
  const b = new Uint8Array(randomBytes());
  if (b.length < 16) throw new RangeError('randomBytes must return 16 bytes');
  let ms = nowMs;
  for (let i = 5; i >= 0; i--) {
    b[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b.subarray(0, 16), (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
