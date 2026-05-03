import type { Db } from './_base';

export const loginAttemptRepo = {
  log(db: Db, data: {
    loginId: string; ip: string; success: boolean;
    userId?: bigint | null; reason?: string | null; userAgent?: string | null;
  }) {
    return db.loginAttempt.create({
      data: {
        loginId: data.loginId,
        ip: data.ip,
        success: data.success,
        userId: data.userId ?? null,
        reason: data.reason ?? null,
        userAgent: data.userAgent ?? null,
      },
    });
  },
  recentFailuresOfUser(db: Db, userId: bigint, since: Date) {
    return db.loginAttempt.count({ where: { userId, success: false, createdAt: { gte: since } } });
  },
};
