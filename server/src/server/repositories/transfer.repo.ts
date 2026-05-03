import { Prisma } from '@prisma/client';
import type { Db } from './_base';

export interface TransferLineCreate {
  goodsId: bigint;
  batchNo?: string;
  qty: string;
  shippedQty?: string | null;
  receivedQty?: string | null;
}

export interface TransferCreateData {
  docNo: string;
  kind: string;
  fromWarehouseId: bigint;
  fromLocationId: bigint;
  toWarehouseId: bigint;
  toLocationId: bigint;
  applicantId?: bigint | null;
  operatorId: bigint;
  operationAt: Date;
  reason?: string | null;
  remark?: string | null;
  status?: number;
}

export const transferRepo = {
  findById(db: Db, id: bigint) {
    return db.transfer.findUnique({ where: { id } });
  },

  findByDocNo(db: Db, docNo: string) {
    return db.transfer.findUnique({ where: { docNo } });
  },

  findByIdWithLines(db: Db, id: bigint) {
    return db.transfer.findUnique({
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
      fromWarehouseId?: bigint;
      toWarehouseId?: bigint;
      status?: number;
      from?: Date;
      to?: Date;
      sortField?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const where: Prisma.TransferWhereInput = {
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.fromWarehouseId !== undefined
        ? { fromWarehouseId: input.fromWarehouseId }
        : {}),
      ...(input.toWarehouseId !== undefined
        ? { toWarehouseId: input.toWarehouseId }
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
    const orderBy: Prisma.TransferOrderByWithRelationInput = {
      [input.sortField ?? 'createdAt']: input.sortOrder ?? 'desc',
    } as Prisma.TransferOrderByWithRelationInput;
    const [total, items] = await Promise.all([
      db.transfer.count({ where }),
      db.transfer.findMany({
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
    input: { header: TransferCreateData; lines: TransferLineCreate[] },
  ) {
    return db.transfer.create({
      data: {
        docNo: input.header.docNo,
        kind: input.header.kind,
        fromWarehouseId: input.header.fromWarehouseId,
        fromLocationId: input.header.fromLocationId,
        toWarehouseId: input.header.toWarehouseId,
        toLocationId: input.header.toLocationId,
        applicantId: input.header.applicantId ?? null,
        operatorId: input.header.operatorId,
        operationAt: input.header.operationAt,
        reason: input.header.reason ?? null,
        remark: input.header.remark ?? null,
        status: input.header.status ?? 10,
        lines: {
          create: input.lines.map((l) => ({
            goodsId: l.goodsId,
            batchNo: l.batchNo ?? '',
            qty: l.qty,
            shippedQty: l.shippedQty ?? null,
            receivedQty: l.receivedQty ?? null,
          })),
        },
      },
      include: { lines: true },
    });
  },

  async updateOptimistic(
    db: Db,
    id: bigint,
    version: number,
    data: Prisma.TransferUpdateInput,
  ) {
    const r = await db.transfer.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    return r.count;
  },

  async delete(db: Db, id: bigint) {
    return db.transfer.delete({ where: { id } });
  },

  async setStatus(db: Db, id: bigint, status: number, by: bigint) {
    return db.transfer.update({
      where: { id },
      data: {
        status,
        statusUpdatedAt: new Date(),
        statusUpdatedBy: by,
        version: { increment: 1 },
      },
    });
  },

  // ----- lines -----
  findLines(db: Db, transferId: bigint) {
    return db.transferLine.findMany({
      where: { transferId },
      orderBy: { id: 'asc' },
    });
  },

  findLineById(db: Db, id: bigint) {
    return db.transferLine.findUnique({ where: { id } });
  },

  addLine(db: Db, transferId: bigint, line: TransferLineCreate) {
    return db.transferLine.create({
      data: {
        transferId,
        goodsId: line.goodsId,
        batchNo: line.batchNo ?? '',
        qty: line.qty,
        shippedQty: line.shippedQty ?? null,
        receivedQty: line.receivedQty ?? null,
      },
    });
  },

  updateLine(db: Db, id: bigint, data: Prisma.TransferLineUpdateInput) {
    return db.transferLine.update({ where: { id }, data });
  },

  removeLine(db: Db, id: bigint) {
    return db.transferLine.delete({ where: { id } });
  },
};
