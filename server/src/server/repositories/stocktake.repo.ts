import { Prisma } from '@prisma/client';
import type { Db } from './_base';

export interface StocktakeLineCreate {
  goodsId: bigint;
  locationId: bigint;
  batchNo?: string;
  bookQty: string;
  actualQty?: string | null;
  difference?: string | null;
  reason?: string | null;
}

export interface StocktakeCreateData {
  docNo: string;
  kind: string;
  warehouseId: bigint;
  locationIds?: string | null;
  categoryIds?: string | null;
  operatorId: bigint;
  operationAt: Date;
  reason?: string | null;
  remark?: string | null;
  status?: number;
}

export const stocktakeRepo = {
  findById(db: Db, id: bigint) {
    return db.stocktake.findUnique({ where: { id } });
  },

  findByDocNo(db: Db, docNo: string) {
    return db.stocktake.findUnique({ where: { docNo } });
  },

  findByIdWithLines(db: Db, id: bigint) {
    return db.stocktake.findUnique({
      where: { id },
      include: { lines: true },
    });
  },

  async findPage(
    db: Db,
    input: {
      page: number;
      pageSize: number;
      keyword?: string;
      kind?: string;
      warehouseId?: bigint;
      status?: number;
      from?: Date;
      to?: Date;
      sortField?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const where: Prisma.StocktakeWhereInput = {
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.warehouseId !== undefined
        ? { warehouseId: input.warehouseId }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.from || input.to
        ? {
            operationAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {}),
      ...(input.keyword
        ? {
            OR: [
              { docNo: { contains: input.keyword } },
              { reason: { contains: input.keyword } },
              { remark: { contains: input.keyword } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.StocktakeOrderByWithRelationInput = {
      [input.sortField ?? 'createdAt']: input.sortOrder ?? 'desc',
    } as Prisma.StocktakeOrderByWithRelationInput;
    const [total, items] = await Promise.all([
      db.stocktake.count({ where }),
      db.stocktake.findMany({
        where,
        orderBy,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    return { total, page: input.page, pageSize: input.pageSize, items };
  },

  async create(
    db: Db,
    input: { header: StocktakeCreateData; lines?: StocktakeLineCreate[] },
  ) {
    return db.stocktake.create({
      data: {
        docNo: input.header.docNo,
        kind: input.header.kind,
        warehouseId: input.header.warehouseId,
        locationIds: input.header.locationIds ?? null,
        categoryIds: input.header.categoryIds ?? null,
        operatorId: input.header.operatorId,
        operationAt: input.header.operationAt,
        reason: input.header.reason ?? null,
        remark: input.header.remark ?? null,
        status: input.header.status ?? 10,
        ...(input.lines && input.lines.length > 0
          ? {
              lines: {
                create: input.lines.map((l) => ({
                  goodsId: l.goodsId,
                  locationId: l.locationId,
                  batchNo: l.batchNo ?? '',
                  bookQty: l.bookQty,
                  actualQty: l.actualQty ?? null,
                  difference: l.difference ?? null,
                  reason: l.reason ?? null,
                })),
              },
            }
          : {}),
      },
      include: { lines: true },
    });
  },

  async updateOptimistic(
    db: Db,
    id: bigint,
    version: number,
    data: Prisma.StocktakeUpdateInput,
  ) {
    const r = await db.stocktake.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    return r.count;
  },

  async delete(db: Db, id: bigint) {
    return db.stocktake.delete({ where: { id } });
  },

  async setStatus(db: Db, id: bigint, status: number, by: bigint) {
    return db.stocktake.update({
      where: { id },
      data: {
        status,
        statusUpdatedAt: new Date(),
        statusUpdatedBy: by,
        version: { increment: 1 },
      },
    });
  },

  async updateGainLossDocNos(
    db: Db,
    id: bigint,
    docs: { gainDocNo?: string | null; lossDocNo?: string | null },
  ) {
    return db.stocktake.update({
      where: { id },
      data: {
        ...(docs.gainDocNo !== undefined ? { gainDocNo: docs.gainDocNo } : {}),
        ...(docs.lossDocNo !== undefined ? { lossDocNo: docs.lossDocNo } : {}),
        version: { increment: 1 },
      },
    });
  },

  // ----- lines -----
  findLines(db: Db, stocktakeId: bigint) {
    return db.stocktakeLine.findMany({
      where: { stocktakeId },
      orderBy: { id: 'asc' },
    });
  },

  findLineById(db: Db, id: bigint) {
    return db.stocktakeLine.findUnique({ where: { id } });
  },

  addLine(db: Db, stocktakeId: bigint, line: StocktakeLineCreate) {
    return db.stocktakeLine.create({
      data: {
        stocktakeId,
        goodsId: line.goodsId,
        locationId: line.locationId,
        batchNo: line.batchNo ?? '',
        bookQty: line.bookQty,
        actualQty: line.actualQty ?? null,
        difference: line.difference ?? null,
        reason: line.reason ?? null,
      },
    });
  },

  updateLine(db: Db, id: bigint, data: Prisma.StocktakeLineUpdateInput) {
    return db.stocktakeLine.update({ where: { id }, data });
  },

  removeLine(db: Db, id: bigint) {
    return db.stocktakeLine.delete({ where: { id } });
  },

  async bulkInsertLines(
    db: Db,
    stocktakeId: bigint,
    lines: StocktakeLineCreate[],
  ) {
    if (lines.length === 0) return { count: 0 };
    return db.stocktakeLine.createMany({
      data: lines.map((l) => ({
        stocktakeId,
        goodsId: l.goodsId,
        locationId: l.locationId,
        batchNo: l.batchNo ?? '',
        bookQty: l.bookQty,
        actualQty: l.actualQty ?? null,
        difference: l.difference ?? null,
        reason: l.reason ?? null,
      })),
    });
  },

  async countActiveByWarehouseAndGoods(
    db: Db,
    warehouseId: bigint,
    _goodsId: bigint,
  ) {
    return db.stocktake.count({
      where: {
        warehouseId,
        status: 20,
      },
    });
  },
};
