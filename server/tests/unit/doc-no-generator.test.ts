import { describe, it, expect } from 'vitest';
import { genDocNo } from '@server/services/docNo.service';

describe('单据号生成器 (DOC-NO-UNIT)', () => {
  const may3 = new Date('2026-05-03T10:00:00Z');

  it('C-DOC-001 RK + YYYYMMDD + 4 位流水', () => {
    expect(genDocNo('RK', 1, may3)).toBe('RK202605030001');
  });

  it('C-DOC-002 流水补 0', () => {
    expect(genDocNo('CK', 42, may3)).toBe('CK202605030042');
  });

  it('流水满 4 位', () => {
    expect(genDocNo('DB', 1234, may3)).toBe('DB202605031234');
  });

  it('流水超过 4 位仍可生成（使用实际位数）', () => {
    expect(genDocNo('PD', 12345, may3)).toBe('PD2026050312345');
  });

  it('支持时区（按本地日历）', () => {
    const localY2026M5D3 = new Date(2026, 4, 3, 12, 0, 0);
    expect(genDocNo('RK', 7, localY2026M5D3)).toMatch(/^RK20260503\d{4}$/);
  });
});
