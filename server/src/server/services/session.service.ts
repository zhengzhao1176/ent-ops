import { sessionRepo } from '../repositories/session.repo';
import type { AppContext } from '../context';
import { randomHex } from '@/lib/crypto';

const SESSION_TTL_MS = 30 * 60 * 1000;

export const sessionService = {
  async issue(ctx: AppContext, userId: bigint) {
    const id = randomHex(16);
    const token = randomHex(32);
    const refreshToken = randomHex(32);
    const expiresAt = new Date(ctx.clock.now().getTime() + SESSION_TTL_MS);
    await sessionRepo.create(ctx.prisma, {
      id,
      userId,
      token,
      expiresAt,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return { token, refreshToken, expiresAt };
  },

  async revokeBySessionId(ctx: AppContext, id: string) {
    return sessionRepo.revoke(ctx.prisma, id);
  },
};
