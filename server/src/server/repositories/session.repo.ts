import type { Db } from './_base';
import { sha256Hex } from '@/lib/crypto';

export const sessionRepo = {
  async create(db: Db, data: {
    id: string; userId: bigint; token: string; expiresAt: Date;
    ip?: string | null; userAgent?: string | null;
  }) {
    return db.session.create({
      data: {
        id: data.id,
        userId: data.userId,
        tokenHash: await sha256Hex(data.token),
        expiresAt: data.expiresAt,
        ip: data.ip ?? null,
        userAgent: data.userAgent ?? null,
      },
    });
  },
  findByTokenHash(db: Db, tokenHash: string) {
    return db.session.findFirst({ where: { tokenHash, revokedAt: null } });
  },
  revoke(db: Db, id: string) {
    return db.session.update({ where: { id }, data: { revokedAt: new Date() } });
  },
  listByUser(db: Db, userId: bigint) {
    return db.session.findMany({ where: { userId, revokedAt: null }, orderBy: { createdAt: 'desc' } });
  },
};
