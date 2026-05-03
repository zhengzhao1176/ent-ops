import { describe, it, expect } from 'vitest';
import { checkStrength } from '@server/services/password.service';

describe('密码强度校验 (F-UM-04 / PASSWORD-STRENGTH-UNIT)', () => {
  it('C-PWD-001 长度 < 8 应失败', () => {
    expect(checkStrength('Aa1234')).toEqual({ ok: false, reason: 'LENGTH' });
  });

  it('C-PWD-002 缺大写字母应失败', () => {
    expect(checkStrength('aa123456')).toEqual({ ok: false, reason: 'COMPLEXITY' });
  });

  it('C-PWD-003 缺小写字母应失败', () => {
    expect(checkStrength('AA123456')).toEqual({ ok: false, reason: 'COMPLEXITY' });
  });

  it('C-PWD-004 缺数字应失败', () => {
    expect(checkStrength('AaBbCcDd')).toEqual({ ok: false, reason: 'COMPLEXITY' });
  });

  it('C-PWD-005 合法密码应通过', () => {
    expect(checkStrength('Aa123456')).toEqual({ ok: true });
  });

  it('空字符串应失败', () => {
    expect(checkStrength('')).toEqual({ ok: false, reason: 'LENGTH' });
  });

  it('超长 (256+) 应失败', () => {
    expect(checkStrength('A1' + 'a'.repeat(254))).toEqual({ ok: false, reason: 'LENGTH' });
  });
});
