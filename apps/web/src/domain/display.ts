// Display rounding, pinned by packages/contracts/nutrition/display.json:
// (x * 10^digits) rounded half away from zero, divided by 10^digits.
// Math.round rounds half up (towards +infinity), so it is applied to |x| and the sign put back.
// Do not round through Intl.NumberFormat or toFixed: they would not match the other runners.

export function roundForDisplay(value: number | null, digits: number): number | null {
  if (value === null) return null;
  if (!Number.isInteger(digits) || digits < 0) throw new RangeError(`digits must be an integer >= 0, got ${digits}`);
  const p = Math.pow(10, digits);
  const scaled = value * p;
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));
  // + 0 turns -0 into 0, so a small negative never shows as "-0".
  return rounded / p + 0;
}
