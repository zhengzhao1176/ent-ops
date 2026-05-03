export interface RateLimitOpts {
  windowMs: number;
  max: number;
}

export class RateLimiter {
  private buckets = new Map<string, number[]>();
  constructor(private opts: RateLimitOpts) {}

  shouldBlock(key: string, nowMs: number): boolean {
    const arr = this.gc(key, nowMs);
    return arr.length >= this.opts.max;
  }

  record(key: string, nowMs: number): void {
    const arr = this.gc(key, nowMs);
    arr.push(nowMs);
    this.buckets.set(key, arr);
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  private gc(key: string, nowMs: number): number[] {
    const cutoff = nowMs - this.opts.windowMs;
    const arr = (this.buckets.get(key) ?? []).filter((t) => t > cutoff);
    this.buckets.set(key, arr);
    return arr;
  }
}

export const loginRateLimiter = new RateLimiter({ windowMs: 60_000, max: 10 });
