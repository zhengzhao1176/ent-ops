import type { Db } from './_base';

export const passwordHistoryRepo = {
  append(db: Db, userId: bigint, passwordHash: string) {
    return db.passwordHistory.create({ data: { userId, passwordHash } });
  },
  recent(db: Db, userId: bigint, n: number) {
    return db.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: n,
    });
  },
};
