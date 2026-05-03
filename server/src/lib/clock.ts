export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(date: Date | string): Clock {
  const d = typeof date === 'string' ? new Date(date) : date;
  return { now: () => new Date(d.getTime()) };
}
