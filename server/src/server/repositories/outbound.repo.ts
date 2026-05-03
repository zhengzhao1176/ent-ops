import { Prisma } from '@prisma/client';
import type { Db } from './_base';

export interface OutboundLineCreate {
  goodsId: bigint;
  locationId: bigint;
  batchNo?: string;
  qty: string;
}

export interface OutboundCreateData {
  docNo: string;
  kind: string;
  targetDocNo?: string | null;
  warehouseId: bigint;
  applicantId?: bigint | null;
  operatorId: bigint;
  operationAt: Date;
  pickStrategy?: string;
  remark?: string | null;
  status?: number;
}

export const outboundRepo = {
  findById(db: Db, id: bigint) {
    return db.outbound.findUnique({ where: { id } });
  },

  findByDocNo(db: Db, docNo: string) {
    return db.outbound.findUnique({ where: { docNo } });
  },

  findByIdWithLines(db: Db, id: bigint) {
    return db.outbound.findUnique({
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
    const where: Prisma.OutboundWhereInput = {
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
              { targetDocNo: { contains: input.keyword } },
              { remark: { contains: input.keyword } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.OutboundOrderByWithRelationInput = {
      [input.sortField ?? 'createdAt']: input.sortOrder ?? 'desc',
    } as Prisma.OutboundOrderByWithRelationInput;
    const [total, items] = await Promise.all([
      db.outbound.count({ where }),
      db.outbound.findMany({
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
    input: { header: OutboundCreateData; lines: OutboundLineCreate[] },
  ) {
    return db.outbound.create({
      data: {
        docNo: input.header.docNo,
        kind: input.header.kind,
        targetDocNo: input.header.targetDocNo ?? null,
        warehouseId: input.header.warehouseId,
        applicantId: input.header.applicantId ?? null,
        operatorId: input.header.operatorId,
        operationAt: input.header.operationAt,
        pickStrategy: input.header.pickStrategy ?? 'FIFO',
        remark: input.header.remark ?? null,
        status: input.header.status ?? 10,
        lines: {
          create: input.lines.map((l) => ({
            goodsId: l.goodsId,
            locationId: l.locationId,
            batchNo: l.batchNo ?? '',
            qty: l.qty,
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
    data: Prisma.OutboundUpdateInput,
  ) {
    const r = await db.outbound.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    return r.count;
  },

  async delete(db: Db, id: bigint) {
    return db.outbound.delete({ where: { id } });
  },

  async setStatus(db: Db, id: bigint, status: number, _by: bigint) {
    return db.outbound.update({
      where: { id },
      data: {
        status,
        version: { increment: 1 },
      },
    });
  },

  // ----- lines -----
  findLines(db: Db, outboundId: bigint) {
    return db.outboundLine.findMany({
      where: { outboundId },
      orderBy: { id: 'asc' },
    });
  },

  findLineById(db: Db, id: bigint) {
    return db.outboundLine.findUnique({ where: { id } });
  },

  addLine(db: Db, outboundId: bigint, line: OutboundLineCreate) {
    return db.outboundLine.create({
      data: {
        outboundId,
        goodsId: line.goodsId,
        locationId: line.locationId,
        batchNo: line.batchNo ?? '',
        qty: line.qty,
      },
    });
  },

  updateLine(db: Db, id: bigint, data: Prisma.OutboundLineUpdateInput) {
    return db.outboundLine.update({ where: { id }, data });
  },

  removeLine(db: Db, id: bigint) {
    return db.outboundLine.delete({ where: { id } });
  },
};
