import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '@server/services/rateLimit.service';

describe('登录限频纯函数 (RATE-LIMIT-UNIT)', () => {
  let limiter: RateLimiter;
  beforeEach(() => {
    limiter = new RateLimiter({ windowMs: 60_000, max: 10 });
  });

  it('C-RL-001 1 分钟内同 IP 第 10 次触发限频', () => {
    const ip = '1.1.1.1';
    const now = new Date('2026-05-03T10:00:00Z').getTime();
    for (let i = 0; i < 9; i++) {
      expect(limiter.shouldBlock(ip, now + i * 1000)).toBe(false);
      limiter.record(ip, now + i * 1000);
    }
    expect(limiter.shouldBlock(ip, now + 9000)).toBe(false);
    limiter.record(ip, now + 9000);
    expect(limiter.shouldBlock(ip, now + 10_000)).toBe(true);
  });

  it('C-RL-002 1 分钟外的请求不计入', () => {
    const ip = '1.1.1.1';
    const t0 = new Date('2026-05-03T10:00:00Z').getTime();
    for (let i = 0; i < 100; i++) limiter.record(ip, t0 + i);
    const future = t0 + 61_000;
    expect(limiter.shouldBlock(ip, future)).toBe(false);
  });

  it('不同 IP 互不影响', () => {
    const t = Date.now();
    for (let i = 0; i < 10; i++) limiter.record('1.1.1.1', t + i);
    expect(limiter.shouldBlock('2.2.2.2', t + 11)).toBe(false);
  });
});
