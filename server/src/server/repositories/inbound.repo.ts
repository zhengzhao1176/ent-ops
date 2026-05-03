import { Prisma } from '@prisma/client';
import type { Db } from './_base';

export interface InboundLineCreate {
  goodsId: bigint;
  locationId: bigint;
  batchNo?: string;
  qty: string;
  unitPrice?: string | null;
  expireAt?: Date | null;
}

export interface InboundCreateData {
  docNo: string;
  kind: string;
  sourceDocNo?: string | null;
  warehouseId: bigint;
  operatorId: bigint;
  operationAt: Date;
  remark?: string | null;
  status?: number;
}

export const inboundRepo = {
  findById(db: Db, id: bigint) {
    return db.inbound.findUnique({ where: { id } });
  },

  findByDocNo(db: Db, docNo: string) {
    return db.inbound.findUnique({ where: { docNo } });
  },

  findByIdWithLines(db: Db, id: bigint) {
    return db.inbound.findUnique({
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
    const where: Prisma.InboundWhereInput = {
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
              { sourceDocNo: { contains: input.keyword } },
              { remark: { contains: input.keyword } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.InboundOrderByWithRelationInput = {
      [input.sortField ?? 'createdAt']: input.sortOrder ?? 'desc',
    } as Prisma.InboundOrderByWithRelationInput;
    const [total, items] = await Promise.all([
      db.inbound.count({ where }),
      db.inbound.findMany({
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
    input: { header: InboundCreateData; lines: InboundLineCreate[] },
  ) {
    return db.inbound.create({
      data: {
        docNo: input.header.docNo,
        kind: input.header.kind,
        sourceDocNo: input.header.sourceDocNo ?? null,
        warehouseId: input.header.warehouseId,
        operatorId: input.header.operatorId,
        operationAt: input.header.operationAt,
        remark: input.header.remark ?? null,
        status: input.header.status ?? 10,
        lines: {
          create: input.lines.map((l) => ({
            goodsId: l.goodsId,
            locationId: l.locationId,
            batchNo: l.batchNo ?? '',
            qty: l.qty,
            unitPrice: l.unitPrice ?? null,
            expireAt: l.expireAt ?? null,
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
    data: Prisma.InboundUpdateInput,
  ) {
    const r = await db.inbound.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    return r.count;
  },

  async delete(db: Db, id: bigint) {
    return db.inbound.delete({ where: { id } });
  },

  async setStatus(
    db: Db,
    id: bigint,
    status: number,
    by: bigint,
  ) {
    return db.inbound.update({
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
  findLines(db: Db, inboundId: bigint) {
    return db.inboundLine.findMany({
      where: { inboundId },
      orderBy: { id: 'asc' },
    });
  },

  findLineById(db: Db, id: bigint) {
    return db.inboundLine.findUnique({ where: { id } });
  },

  addLine(
    db: Db,
    inboundId: bigint,
    line: InboundLineCreate,
  ) {
    return db.inboundLine.create({
      data: {
        inboundId,
        goodsId: line.goodsId,
        locationId: line.locationId,
        batchNo: line.batchNo ?? '',
        qty: line.qty,
        unitPrice: line.unitPrice ?? null,
        expireAt: line.expireAt ?? null,
      },
    });
  },

  updateLine(
    db: Db,
    id: bigint,
    data: Prisma.InboundLineUpdateInput,
  ) {
    return db.inboundLine.update({ where: { id }, data });
  },

  removeLine(db: Db, id: bigint) {
    return db.inboundLine.delete({ where: { id } });
  },
};
