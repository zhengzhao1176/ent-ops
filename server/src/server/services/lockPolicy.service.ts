export const LOCK_THRESHOLD = 5;
export const LOCK_DURATION_MS = 30 * 60 * 1000;

export interface LockState {
  shouldLock: boolean;
  lockedUntil: Date | null;
  autoUnlock: boolean;
}

export interface ComputeLockInput {
  failCount: number;
  now: Date;
  currentLockedUntil?: Date | null;
}

export function computeLockState({ failCount, now, currentLockedUntil }: ComputeLockInput): LockState {
  if (currentLockedUntil && currentLockedUntil.getTime() <= now.getTime()) {
    return { shouldLock: false, lockedUntil: null, autoUnlock: true };
  }
  if (currentLockedUntil && currentLockedUntil.getTime() > now.getTime()) {
    return { shouldLock: true, lockedUntil: currentLockedUntil, autoUnlock: false };
  }
  if (failCount >= LOCK_THRESHOLD) {
    return {
      shouldLock: true,
      lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS),
      autoUnlock: false,
    };
  }
  return { shouldLock: false, lockedUntil: null, autoUnlock: false };
}
