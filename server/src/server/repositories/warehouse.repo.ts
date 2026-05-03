import { Prisma } from '@prisma/client';
import type { Db } from './_base';

export const warehouseRepo = {
  findById(db: Db, id: bigint, opts?: { includeDeleted?: boolean }) {
    return db.warehouse.findFirst({
      where: { id, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
    });
  },

  findByCode(db: Db, code: string, opts?: { includeDeleted?: boolean }) {
    return db.warehouse.findFirst({
      where: { code, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
    });
  },

  findByIdRaw(db: Db, id: bigint) {
    return db.warehouse.findUnique({ where: { id } });
  },

  async findPage(
    db: Db,
    input: {
      page: number;
      pageSize: number;
      keyword?: string;
      kind?: string;
      status?: string;
      includeDeleted?: boolean;
      sortField?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const where: Prisma.WarehouseWhereInput = {
      ...(input.includeDeleted ? {} : { deletedAt: null }),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.keyword
        ? {
            OR: [
              { code: { contains: input.keyword } },
              { name: { contains: input.keyword } },
              { address: { contains: input.keyword } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.WarehouseOrderByWithRelationInput = {
      [input.sortField ?? 'createdAt']: input.sortOrder ?? 'desc',
    } as Prisma.WarehouseOrderByWithRelationInput;
    const [total, items] = await Promise.all([
      db.warehouse.count({ where }),
      db.warehouse.findMany({
        where,
        orderBy,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    return { total, page: input.page, pageSize: input.pageSize, items };
  },

  create(db: Db, data: Prisma.WarehouseUncheckedCreateInput) {
    return db.warehouse.create({ data });
  },

  async updateOptimistic(
    db: Db,
    id: bigint,
    version: number,
    data: Prisma.WarehouseUpdateInput,
  ) {
    const r = await db.warehouse.updateMany({
      where: { id, version, deletedAt: null },
      data: { ...data, version: { increment: 1 } },
    });
    return r.count;
  },

  async softDelete(db: Db, id: bigint) {
    return db.warehouse.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },

  async restore(db: Db, id: bigint) {
    return db.warehouse.update({
      where: { id },
      data: { deletedAt: null },
    });
  },

  countLocations(db: Db, warehouseId: bigint) {
    return db.location.count({ where: { warehouseId, deletedAt: null } });
  },

  countStocks(db: Db, warehouseId: bigint) {
    return db.stock.count({ where: { warehouseId } });
  },
};
