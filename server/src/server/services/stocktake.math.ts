// ============================================================
// Stocktake decimal math (pure functions; no IO).
//
// All quantities are decimal strings with up to 4 fraction digits, matching
// the project-wide convention used by stock.math / stock.repo.  We replicate
// the bigint-scale-by-10000 idiom locally so this module stays pure and
// dependency-free (mirrors stock.math's internal helpers).
// ============================================================
const SCALE = 10000n;

function toRaw(s: string): bigint {
  let v = typeof s === 'string' ? s : String(s);
  const neg = v.startsWith('-');
  if (neg) v = v.slice(1);
  const [intPart, fracPart = ''] = v.split('.');
  const frac = (fracPart + '0000').slice(0, 4);
  const raw = BigInt(intPart || '0') * SCALE + BigInt(frac || '0');
  return neg ? -raw : raw;
}

function toStr(raw: bigint): string {
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const intPart = abs / SCALE;
  const fracPart = abs % SCALE;
  const fracStr = fracPart.toString().padStart(4, '0').replace(/0+$/, '');
  const s = fracStr ? `${intPart}.${fracStr}` : intPart.toString();
  // Sign: zero is always returned as "0" (no "-0"), and equal high-precision
  // numbers must produce a clean "0" with no trailing fraction.
  if (raw === 0n) return '0';
  return neg ? `-${s}` : s;
}

/**
 * Compute the inventory difference between book qty and physical count.
 *
 *   difference = actualQty - bookQty
 *
 * Returns a decimal string preserving up to 4 fraction digits.  Trailing
 * zeros are trimmed (e.g. computeDifference('1.0001', '1.0001') === '0').
 *
 * Sign convention:
 *   - positive  → 盘盈 (gain) : actual > book
 *   - negative  → 盘亏 (loss) : actual < book
 *   - zero      → 无差异     : actual === book
 */
export function computeDifference(book: string, actual: string): string {
  return toStr(toRaw(actual) - toRaw(book));
}

/**
 * Classify a difference string into 'GAIN' (positive), 'LOSS' (negative)
 * or 'NONE' (zero).
 *
 * The check is done on the raw bigint so any non-zero value (even
 * '0.0001') is correctly classified.  Plain string sign-checks would not
 * handle representations like '0.0' / '-0' / '+5' robustly.
 */
export function classifyDifference(diff: string): 'GAIN' | 'LOSS' | 'NONE' {
  const r = toRaw(diff);
  if (r > 0n) return 'GAIN';
  if (r < 0n) return 'LOSS';
  return 'NONE';
}
