import { describe, it, expect } from 'vitest';
import { validateTransition } from '@server/services/stateMachine.service';

describe('单据状态机校验 (STATE-MACHINE-UNIT)', () => {
  it('C-SM-001 Inbound 草稿 (10) → 已审核 (30) 不允许跳级', () => {
    expect(() => validateTransition('Inbound', 10, 30)).toThrowError(/ILLEGAL_TRANSITION/);
  });

  it('C-SM-002 已完成 (40) 禁止任何 transition', () => {
    expect(() => validateTransition('Inbound', 40, 90)).toThrowError(/ILLEGAL_TRANSITION/);
    expect(() => validateTransition('Inbound', 40, 30)).toThrowError(/ILLEGAL_TRANSITION/);
  });

  it('Inbound 合法链路 10 → 20 → 30 → 40', () => {
    expect(() => validateTransition('Inbound', 10, 20)).not.toThrow();
    expect(() => validateTransition('Inbound', 20, 30)).not.toThrow();
    expect(() => validateTransition('Inbound', 30, 40)).not.toThrow();
  });

  it('Inbound 草稿 / 待审核 → 作废 (90) 合法', () => {
    expect(() => validateTransition('Inbound', 10, 90)).not.toThrow();
    expect(() => validateTransition('Inbound', 20, 90)).not.toThrow();
  });

  it('Inbound 已审核 → 作废 不允许', () => {
    expect(() => validateTransition('Inbound', 30, 90)).toThrowError(/ILLEGAL_TRANSITION/);
  });

  it('Outbound 合法链路 10 → 20 → 25 → 30 → 40', () => {
    expect(() => validateTransition('Outbound', 10, 20)).not.toThrow();
    expect(() => validateTransition('Outbound', 20, 25)).not.toThrow();
    expect(() => validateTransition('Outbound', 25, 30)).not.toThrow();
    expect(() => validateTransition('Outbound', 30, 40)).not.toThrow();
  });
});
