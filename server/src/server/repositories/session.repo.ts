import type { Db } from './_base';
import crypto from 'node:crypto';

export const sessionRepo = {
  create(db: Db, data: {
    id: string; userId: bigint; token: string; expiresAt: Date;
    ip?: string | null; userAgent?: string | null;
  }) {
    return db.session.create({
      data: {
        id: data.id,
        userId: data.userId,
        tokenHash: crypto.createHash('sha256').update(data.token).digest('hex'),
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
