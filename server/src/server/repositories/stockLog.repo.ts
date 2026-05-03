import { Prisma } from '@prisma/client';
import type { Db } from './_base';

// Append-only log: only `append` and read methods are exposed.
// No update / delete on purpose (P-CRUD-IMMUTABLE).

export const stockLogRepo = {
  append(
    db: Db,
    data: {
      stockId: bigint;
      warehouseId: bigint;
      goodsId: bigint;
      changeType: string;
      qtyBefore: string;
      qtyChange: string;
      qtyAfter: string;
      refDocNo?: string | null;
      operatorId?: bigint | null;
    },
  ) {
    return db.stockLog.create({
      data: {
        stockId: data.stockId,
        warehouseId: data.warehouseId,
        goodsId: data.goodsId,
        changeType: data.changeType,
        qtyBefore: data.qtyBefore,
        qtyChange: data.qtyChange,
        qtyAfter: data.qtyAfter,
        refDocNo: data.refDocNo ?? null,
        operatorId: data.operatorId ?? null,
      },
    });
  },

  findById(db: Db, id: bigint) {
    return db.stockLog.findUnique({ where: { id } });
  },

  async findPage(
    db: Db,
    input: {
      page: number;
      pageSize: number;
      stockId?: bigint;
      goodsId?: bigint;
      warehouseId?: bigint;
      changeType?: string;
      from?: Date;
      to?: Date;
      sortField?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const where: Prisma.StockLogWhereInput = {
      ...(input.stockId !== undefined ? { stockId: input.stockId } : {}),
      ...(input.goodsId !== undefined ? { goodsId: input.goodsId } : {}),
      ...(input.warehouseId !== undefined
        ? { warehouseId: input.warehouseId }
        : {}),
      ...(input.changeType ? { changeType: input.changeType } : {}),
      ...(input.from || input.to
        ? {
            createdAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {}),
    };
    const orderBy: Prisma.StockLogOrderByWithRelationInput = {
      [input.sortField ?? 'createdAt']: input.sortOrder ?? 'desc',
    } as Prisma.StockLogOrderByWithRelationInput;
    const [total, items] = await Promise.all([
      db.stockLog.count({ where }),
      db.stockLog.findMany({
        where,
        orderBy,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    return { total, page: input.page, pageSize: input.pageSize, items };
  },

  listByStock(db: Db, stockId: bigint) {
    return db.stockLog.findMany({
      where: { stockId },
      orderBy: { createdAt: 'asc' },
    });
  },
};
