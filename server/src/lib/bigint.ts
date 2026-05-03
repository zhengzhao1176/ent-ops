export function toBigInt(v: unknown): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(v);
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return BigInt(v);
  throw new TypeError(`cannot convert to bigint: ${String(v)}`);
}

export function bigintReplacer(_k: string, v: unknown) {
  return typeof v === 'bigint' ? v.toString() : v;
}
