import { describe, it, expect } from 'vitest';
import { computeAvailable, applyDelta, pickBatches } from '@server/services/stock.math';

describe('库存数学纯函数 (STOCK-MATH-UNIT)', () => {
  it('C-STM-001 可用 = 在库 - 锁定 - 在途出库', () => {
    expect(computeAvailable({ onHand: '100', locked: '20', inTransit: '10' })).toBe('70');
  });

  it('精度保留 4 位', () => {
    expect(computeAvailable({ onHand: '10.0001', locked: '0', inTransit: '0' })).toBe('10.0001');
  });

  it('C-STM-002 任何变更不允许结果 < 0', () => {
    expect(() => applyDelta('10', '-20')).toThrowError(/NEGATIVE_STOCK/);
  });

  it('applyDelta 正常加减', () => {
    expect(applyDelta('100', '50')).toBe('150');
    expect(applyDelta('100', '-30')).toBe('70');
  });

  it('C-STM-003 FIFO 按 createdAt 升序拣货', () => {
    const batches = [
      { id: 'A', qty: '30', createdAt: new Date('2026-01-01'), expireAt: new Date('2027-01-01') },
      { id: 'B', qty: '30', createdAt: new Date('2026-02-01'), expireAt: new Date('2027-02-01') },
      { id: 'C', qty: '30', createdAt: new Date('2026-03-01'), expireAt: new Date('2027-03-01') },
    ];
    expect(pickBatches('FIFO', '50', batches)).toEqual([
      { id: 'A', qty: '30' },
      { id: 'B', qty: '20' },
    ]);
  });

  it('C-STM-004 FEFO 按 expireAt 升序拣货', () => {
    const batches = [
      { id: 'A', qty: '30', createdAt: new Date('2026-01-01'), expireAt: new Date('2027-03-01') },
      { id: 'B', qty: '30', createdAt: new Date('2026-02-01'), expireAt: new Date('2027-01-01') },
      { id: 'C', qty: '30', createdAt: new Date('2026-03-01'), expireAt: new Date('2027-02-01') },
    ];
    expect(pickBatches('FEFO', '40', batches)).toEqual([
      { id: 'B', qty: '30' },
      { id: 'C', qty: '10' },
    ]);
  });

  it('FIFO/FEFO 库存不够应抛 INSUFFICIENT', () => {
    const batches = [{ id: 'A', qty: '10', createdAt: new Date(), expireAt: null as Date | null }];
    expect(() => pickBatches('FIFO', '20', batches)).toThrowError(/INSUFFICIENT/);
  });
});
