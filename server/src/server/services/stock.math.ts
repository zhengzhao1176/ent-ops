// Decimal as string with up to 4 decimals.
const SCALE = 10000n;

function toRaw(s: string): bigint {
  if (typeof s !== 'string') s = String(s);
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const [intPart, fracPart = ''] = s.split('.');
  const frac = (fracPart + '0000').slice(0, 4);
  const v = BigInt(intPart || '0') * SCALE + BigInt(frac || '0');
  return neg ? -v : v;
}

function toStr(raw: bigint): string {
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const intPart = abs / SCALE;
  const fracPart = abs % SCALE;
  const fracStr = fracPart.toString().padStart(4, '0').replace(/0+$/, '');
  const s = fracStr ? `${intPart}.${fracStr}` : intPart.toString();
  return neg ? `-${s}` : s;
}

export function computeAvailable(input: { onHand: string; locked: string; inTransit: string }): string {
  const r = toRaw(input.onHand) - toRaw(input.locked) - toRaw(input.inTransit);
  return toStr(r);
}

export function applyDelta(current: string, delta: string): string {
  const r = toRaw(current) + toRaw(delta);
  if (r < 0n) throw new Error('NEGATIVE_STOCK');
  return toStr(r);
}

export interface BatchInfo {
  id: string;
  qty: string;
  createdAt: Date;
  expireAt: Date | null;
}

export interface PickResult {
  id: string;
  qty: string;
}

export function pickBatches(strategy: 'FIFO' | 'FEFO' | 'MANUAL', need: string, batches: BatchInfo[]): PickResult[] {
  const sorted = [...batches];
  if (strategy === 'FIFO') sorted.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  else if (strategy === 'FEFO') {
    sorted.sort((a, b) => {
      const ax = a.expireAt ? a.expireAt.getTime() : Number.MAX_SAFE_INTEGER;
      const bx = b.expireAt ? b.expireAt.getTime() : Number.MAX_SAFE_INTEGER;
      return ax - bx;
    });
  }
  let remaining = toRaw(need);
  const out: PickResult[] = [];
  for (const b of sorted) {
    if (remaining <= 0n) break;
    const have = toRaw(b.qty);
    const take = have < remaining ? have : remaining;
    if (take > 0n) {
      out.push({ id: b.id, qty: toStr(take) });
      remaining -= take;
    }
  }
  if (remaining > 0n) throw new Error('INSUFFICIENT_STOCK');
  return out;
}

export const stockMath = { toRaw, toStr };
