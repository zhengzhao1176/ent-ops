import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@server/services/password.service';

describe('密码哈希 (F-UM-04)', () => {
  it('同一明文每次哈希不相同', async () => {
    const a = await hashPassword('Aa123456');
    const b = await hashPassword('Aa123456');
    expect(a).not.toEqual(b);
  });

  it('哈希后可验证', async () => {
    const h = await hashPassword('Aa123456');
    expect(await verifyPassword('Aa123456', h)).toBe(true);
  });

  it('错误密码验证失败', async () => {
    const h = await hashPassword('Aa123456');
    expect(await verifyPassword('WrongPass1', h)).toBe(false);
  });

  it('哈希长度 ≥ 50（bcrypt 通常 60）', async () => {
    const h = await hashPassword('Aa123456');
    expect(h.length).toBeGreaterThanOrEqual(50);
  });
});
