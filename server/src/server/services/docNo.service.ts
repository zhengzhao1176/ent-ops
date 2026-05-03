export function genDocNo(prefix: string, seq: number, when: Date = new Date()): string {
  const y = when.getFullYear().toString().padStart(4, '0');
  const m = (when.getMonth() + 1).toString().padStart(2, '0');
  const d = when.getDate().toString().padStart(2, '0');
  const seqStr = seq.toString().length < 4 ? seq.toString().padStart(4, '0') : seq.toString();
  return `${prefix}${y}${m}${d}${seqStr}`;
}
