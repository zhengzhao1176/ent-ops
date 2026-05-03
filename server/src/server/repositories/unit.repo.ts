import { Prisma } from '@prisma/client';
import type { Db } from './_base';

export const unitRepo = {
  findById(db: Db, id: bigint) {
    return db.unit.findUnique({ where: { id } });
  },

  findByCode(db: Db, code: string) {
    return db.unit.findUnique({ where: { code } });
  },

  list(db: Db, input?: { keyword?: string; status?: string }) {
    const where: Prisma.UnitWhereInput = {
      ...(input?.status ? { status: input.status } : {}),
      ...(input?.keyword
        ? {
            OR: [
              { code: { contains: input.keyword } },
              { name: { contains: input.keyword } },
            ],
          }
        : {}),
    };
    return db.unit.findMany({ where, orderBy: { code: 'asc' } });
  },

  countGoods(db: Db, unitId: bigint) {
    return db.goods.count({ where: { unitId, deletedAt: null } });
  },

  create(db: Db, data: Prisma.UnitUncheckedCreateInput) {
    return db.unit.create({ data });
  },

  update(db: Db, id: bigint, data: Prisma.UnitUpdateInput) {
    return db.unit.update({ where: { id }, data });
  },

  async delete(db: Db, id: bigint) {
    return db.unit.delete({ where: { id } });
  },
};
