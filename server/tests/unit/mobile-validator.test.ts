import { describe, it, expect } from 'vitest';
import { validateMobile } from '@server/services/validators';

describe('手机号格式校验 (MOBILE-UNIT)', () => {
  it('C-MOB-001 13800001234 合法', () => {
    expect(validateMobile('13800001234')).toBe(true);
  });

  it('C-MOB-002 12345678901 非法（首位非1或第二位非3-9）', () => {
    expect(validateMobile('12345678901')).toBe(false);
  });

  it('C-MOB-003 138000012345 长度 12 非法', () => {
    expect(validateMobile('138000012345')).toBe(false);
  });

  it('1380000123 长度 10 非法', () => {
    expect(validateMobile('1380000123')).toBe(false);
  });

  it('含字母非法', () => {
    expect(validateMobile('1380000a234')).toBe(false);
  });

  it('全 11 个网段（13~19）首位均合法', () => {
    for (const n of [3, 4, 5, 6, 7, 8, 9]) {
      expect(validateMobile(`1${n}800001234`)).toBe(true);
    }
  });

  it('网段 12 第二位非法', () => {
    expect(validateMobile('12800001234')).toBe(false);
  });
});
