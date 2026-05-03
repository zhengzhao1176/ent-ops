import bcrypt from 'bcryptjs';

export type StrengthResult = { ok: true } | { ok: false; reason: 'LENGTH' | 'COMPLEXITY' };

export function checkStrength(password: string): StrengthResult {
  if (password.length < 8 || password.length > 64) return { ok: false, reason: 'LENGTH' };
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  if (!hasUpper || !hasLower || !hasDigit) return { ok: false, reason: 'COMPLEXITY' };
  return { ok: true };
}

const COST = process.env.NODE_ENV === 'test' ? 4 : 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateInitialPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digit = '23456789';
  let pwd = upper[Math.floor(Math.random() * upper.length)] +
            lower[Math.floor(Math.random() * lower.length)] +
            digit[Math.floor(Math.random() * digit.length)];
  for (let i = 0; i < 9; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}
