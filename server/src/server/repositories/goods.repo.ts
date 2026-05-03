import { Prisma } from '@prisma/client';
import type { Db } from './_base';

export const goodsRepo = {
  findById(db: Db, id: bigint, opts?: { includeDeleted?: boolean }) {
    return db.goods.findFirst({
      where: { id, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
    });
  },

  findByCode(db: Db, code: string, opts?: { includeDeleted?: boolean }) {
    return db.goods.findFirst({
      where: { code, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
    });
  },

  findByIdRaw(db: Db, id: bigint) {
    return db.goods.findUnique({ where: { id } });
  },

  findByIdWithRelations(db: Db, id: bigint) {
    return db.goods.findFirst({
      where: { id, deletedAt: null },
      include: { category: true, unit: true },
    });
  },

  async findPage(
    db: Db,
    input: {
      page: number;
      pageSize: number;
      keyword?: string;
      categoryId?: bigint;
      status?: string;
      includeDeleted?: boolean;
      sortField?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const where: Prisma.GoodsWhereInput = {
      ...(input.includeDeleted ? {} : { deletedAt: null }),
      ...(input.categoryId !== undefined
        ? { categoryId: input.categoryId }
        : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.keyword
        ? {
            OR: [
              { code: { contains: input.keyword } },
              { name: { contains: input.keyword } },
              { barcode: { contains: input.keyword } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.GoodsOrderByWithRelationInput = {
      [input.sortField ?? 'createdAt']: input.sortOrder ?? 'desc',
    } as Prisma.GoodsOrderByWithRelationInput;
    const [total, items] = await Promise.all([
      db.goods.count({ where }),
      db.goods.findMany({
        where,
        orderBy,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    return { total, page: input.page, pageSize: input.pageSize, items };
  },

  create(db: Db, data: Prisma.GoodsUncheckedCreateInput) {
    return db.goods.create({ data });
  },

  async updateOptimistic(
    db: Db,
    id: bigint,
    version: number,
    data: Prisma.GoodsUpdateInput,
  ) {
    const r = await db.goods.updateMany({
      where: { id, version, deletedAt: null },
      data: { ...data, version: { increment: 1 } },
    });
    return r.count;
  },

  async softDelete(db: Db, id: bigint) {
    return db.goods.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },

  async restore(db: Db, id: bigint) {
    return db.goods.update({
      where: { id },
      data: { deletedAt: null },
    });
  },

  async setStatus(db: Db, id: bigint, status: string) {
    return db.goods.update({
      where: { id },
      data: { status, version: { increment: 1 } },
    });
  },

  countByCategory(db: Db, categoryId: bigint) {
    return db.goods.count({ where: { categoryId, deletedAt: null } });
  },

  countByUnit(db: Db, unitId: bigint) {
    return db.goods.count({ where: { unitId, deletedAt: null } });
  },
};
