import { describe, it, expect } from 'vitest';
import { computeLockState } from '@server/services/lockPolicy.service';

describe('账户锁定策略 (F-UM-02-EXTRA)', () => {
  const now = new Date('2026-05-03T10:00:00Z');

  it('失败次数 < 5 不锁', () => {
    expect(computeLockState({ failCount: 4, now })).toEqual({ shouldLock: false, lockedUntil: null });
  });

  it('失败次数 = 5 锁 30 分钟', () => {
    const r = computeLockState({ failCount: 5, now });
    expect(r.shouldLock).toBe(true);
    expect(r.lockedUntil!.getTime()).toBe(now.getTime() + 30 * 60 * 1000);
  });

  it('已锁定但 lockedUntil 已过应自动解锁', () => {
    const past = new Date(now.getTime() - 1000);
    const r = computeLockState({ failCount: 5, now, currentLockedUntil: past });
    expect(r.autoUnlock).toBe(true);
  });

  it('已锁定且未过期保持锁', () => {
    const future = new Date(now.getTime() + 60_000);
    const r = computeLockState({ failCount: 5, now, currentLockedUntil: future });
    expect(r.autoUnlock).toBe(false);
    expect(r.shouldLock).toBe(true);
  });
});
