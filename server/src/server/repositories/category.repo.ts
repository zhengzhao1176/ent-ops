import { Prisma } from '@prisma/client';
import type { Db } from './_base';

export const categoryRepo = {
  findById(db: Db, id: bigint, opts?: { includeDeleted?: boolean }) {
    return db.category.findFirst({
      where: { id, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
    });
  },

  findByCode(db: Db, code: string, opts?: { includeDeleted?: boolean }) {
    return db.category.findFirst({
      where: { code, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
    });
  },

  findByIdRaw(db: Db, id: bigint) {
    return db.category.findUnique({ where: { id } });
  },

  list(
    db: Db,
    input?: {
      parentId?: bigint;
      status?: string;
      keyword?: string;
      includeDeleted?: boolean;
    },
  ) {
    const where: Prisma.CategoryWhereInput = {
      ...(input?.includeDeleted ? {} : { deletedAt: null }),
      ...(input?.parentId !== undefined ? { parentId: input.parentId } : {}),
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
    return db.category.findMany({
      where,
      orderBy: [{ depth: 'asc' }, { sort: 'asc' }],
    });
  },

  tree(db: Db) {
    return db.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ depth: 'asc' }, { sort: 'asc' }],
    });
  },

  findChildren(db: Db, parentId: bigint | null) {
    return db.category.findMany({
      where: { parentId, deletedAt: null },
      orderBy: { sort: 'asc' },
    });
  },

  findDescendants(db: Db, ancestorPath: string) {
    return db.category.findMany({
      where: {
        path: { startsWith: ancestorPath + '/' },
        deletedAt: null,
      },
    });
  },

  findAncestorsByPath(db: Db, path: string) {
    // path like "/A/B/C" -> ancestors are "/A", "/A/B"
    const parts = path.split('/').filter(Boolean);
    const ancestors: string[] = [];
    let cur = '';
    for (let i = 0; i < parts.length - 1; i++) {
      cur += '/' + parts[i];
      ancestors.push(cur);
    }
    if (ancestors.length === 0) return Promise.resolve([]);
    return db.category.findMany({
      where: { path: { in: ancestors }, deletedAt: null },
      orderBy: { depth: 'asc' },
    });
  },

  countGoods(db: Db, categoryId: bigint) {
    return db.goods.count({ where: { categoryId, deletedAt: null } });
  },

  create(db: Db, data: Prisma.CategoryUncheckedCreateInput) {
    return db.category.create({ data });
  },

  async updateOptimistic(
    db: Db,
    id: bigint,
    version: number,
    data: Prisma.CategoryUpdateInput,
  ) {
    const r = await db.category.updateMany({
      where: { id, version, deletedAt: null },
      data: { ...data, version: { increment: 1 } },
    });
    return r.count;
  },

  async softDelete(db: Db, id: bigint) {
    return db.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },

  async restore(db: Db, id: bigint) {
    return db.category.update({
      where: { id },
      data: { deletedAt: null },
    });
  },
};
