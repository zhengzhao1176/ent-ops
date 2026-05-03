import { describe, it, expect } from 'vitest';
import { computeDifference, classifyDifference } from '@server/services/stocktake.math';

describe('盘点差异纯函数 (STOCKTAKE-MATH-UNIT)', () => {
  it('C-STK-001 实盘 < 账面 返回负差异（盘亏）', () => {
    expect(computeDifference('100', '95')).toBe('-5');
  });

  it('C-STK-002 实盘 > 账面 返回正差异（盘盈）', () => {
    expect(computeDifference('100', '105')).toBe('5');
  });

  it('C-STK-003 实盘 = 账面 返回 0', () => {
    expect(computeDifference('100', '100')).toBe('0');
  });

  it('C-STK-004 高精度小数差异保留小数位', () => {
    expect(computeDifference('10.5000', '10.4995')).toBe('-0.0005');
  });

  it('C-STK-005 classifyDifference 按符号返回 GAIN/LOSS/NONE', () => {
    expect(classifyDifference('5')).toBe('GAIN');
    expect(classifyDifference('-3')).toBe('LOSS');
    expect(classifyDifference('0')).toBe('NONE');
  });

  it('零账面零实盘返回 0', () => {
    expect(computeDifference('0', '0')).toBe('0');
  });

  it('相等的高精度数差异为 0 且不留尾部 0', () => {
    expect(computeDifference('1.0001', '1.0001')).toBe('0');
  });

  it('classifyDifference 任意正数都视为 GAIN', () => {
    expect(classifyDifference('0.0001')).toBe('GAIN');
  });

  it('classifyDifference 任意负数都视为 LOSS', () => {
    expect(classifyDifference('-0.0001')).toBe('LOSS');
  });
});
