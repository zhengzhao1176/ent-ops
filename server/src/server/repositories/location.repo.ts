import { Prisma } from '@prisma/client';
import type { Db } from './_base';

export const locationRepo = {
  findById(db: Db, id: bigint, opts?: { includeDeleted?: boolean }) {
    return db.location.findFirst({
      where: { id, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
    });
  },

  findByIdRaw(db: Db, id: bigint) {
    return db.location.findUnique({ where: { id } });
  },

  findByWarehouseAndCode(
    db: Db,
    warehouseId: bigint,
    code: string,
    opts?: { includeDeleted?: boolean },
  ) {
    return db.location.findFirst({
      where: {
        warehouseId,
        code,
        ...(opts?.includeDeleted ? {} : { deletedAt: null }),
      },
    });
  },

  async findPage(
    db: Db,
    input: {
      page: number;
      pageSize: number;
      keyword?: string;
      warehouseId?: bigint;
      status?: string;
      includeDeleted?: boolean;
      sortField?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const where: Prisma.LocationWhereInput = {
      ...(input.includeDeleted ? {} : { deletedAt: null }),
      ...(input.warehouseId !== undefined
        ? { warehouseId: input.warehouseId }
        : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.keyword
        ? {
            OR: [
              { code: { contains: input.keyword } },
              { name: { contains: input.keyword } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.LocationOrderByWithRelationInput = {
      [input.sortField ?? 'createdAt']: input.sortOrder ?? 'desc',
    } as Prisma.LocationOrderByWithRelationInput;
    const [total, items] = await Promise.all([
      db.location.count({ where }),
      db.location.findMany({
        where,
        orderBy,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    return { total, page: input.page, pageSize: input.pageSize, items };
  },

  listByWarehouse(db: Db, warehouseId: bigint) {
    return db.location.findMany({
      where: { warehouseId, deletedAt: null },
      orderBy: { code: 'asc' },
    });
  },

  create(db: Db, data: Prisma.LocationUncheckedCreateInput) {
    return db.location.create({ data });
  },

  async updateOptimistic(
    db: Db,
    id: bigint,
    version: number,
    data: Prisma.LocationUpdateInput,
  ) {
    const r = await db.location.updateMany({
      where: { id, version, deletedAt: null },
      data: { ...data, version: { increment: 1 } },
    });
    return r.count;
  },

  async softDelete(db: Db, id: bigint) {
    return db.location.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },

  async restore(db: Db, id: bigint) {
    return db.location.update({
      where: { id },
      data: { deletedAt: null },
    });
  },

  countStocks(db: Db, locationId: bigint) {
    return db.stock.count({ where: { locationId } });
  },
};
