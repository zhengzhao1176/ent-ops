import { Prisma } from '@prisma/client';
import type { Db } from './_base';

// ============================================================
// Inline decimal helpers (string scaled to 4 fraction digits).
// Mirrors the public logic in services/stock.math.ts but kept
// private to the repo so we don't pull in the service layer.
// ============================================================
const SCALE = 10000n;

function parseDec(s: string): bigint {
  let v = typeof s === 'string' ? s : String(s);
  const neg = v.startsWith('-');
  if (neg) v = v.slice(1);
  const [intPart, fracPart = ''] = v.split('.');
  const frac = (fracPart + '0000').slice(0, 4);
  const raw = BigInt(intPart || '0') * SCALE + BigInt(frac || '0');
  return neg ? -raw : raw;
}

function formatDec(raw: bigint): string {
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const intPart = abs / SCALE;
  const fracPart = abs % SCALE;
  const fracStr = fracPart.toString().padStart(4, '0').replace(/0+$/, '');
  const s = fracStr ? `${intPart}.${fracStr}` : intPart.toString();
  return neg ? `-${s}` : s;
}

function addDec(a: string, b: string): string {
  return formatDec(parseDec(a) + parseDec(b));
}

function subDec(a: string, b: string): string {
  return formatDec(parseDec(a) - parseDec(b));
}

function recomputeAvailable(onHand: string, locked: string, inTransit: string): string {
  return formatDec(parseDec(onHand) - parseDec(locked) - parseDec(inTransit));
}

// ============================================================
// Stock repository
// ============================================================

export interface StockKey {
  wh: bigint;
  loc: bigint;
  goods: bigint;
  batch?: string;
}

export const stockRepo = {
  findById(db: Db, id: bigint) {
    return db.stock.findUnique({ where: { id } });
  },

  findOneByKey(db: Db, key: StockKey) {
    return db.stock.findUnique({
      where: {
        warehouseId_locationId_goodsId_batchNo: {
          warehouseId: key.wh,
          locationId: key.loc,
          goodsId: key.goods,
          batchNo: key.batch ?? '',
        },
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
      locationId?: bigint;
      goodsId?: bigint;
      batchNo?: string;
      sortField?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const where: Prisma.StockWhereInput = {
      ...(input.warehouseId !== undefined
        ? { warehouseId: input.warehouseId }
        : {}),
      ...(input.locationId !== undefined
        ? { locationId: input.locationId }
        : {}),
      ...(input.goodsId !== undefined ? { goodsId: input.goodsId } : {}),
      ...(input.batchNo !== undefined ? { batchNo: input.batchNo } : {}),
      ...(input.keyword
        ? {
            OR: [
              { batchNo: { contains: input.keyword } },
              { goods: { code: { contains: input.keyword } } },
              { goods: { name: { contains: input.keyword } } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.StockOrderByWithRelationInput = {
      [input.sortField ?? 'updatedAt']: input.sortOrder ?? 'desc',
    } as Prisma.StockOrderByWithRelationInput;
    const [total, items] = await Promise.all([
      db.stock.count({ where }),
      db.stock.findMany({
        where,
        orderBy,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    return { total, page: input.page, pageSize: input.pageSize, items };
  },

  listByGoods(db: Db, goodsId: bigint, warehouseId?: bigint) {
    return db.stock.findMany({
      where: {
        goodsId,
        ...(warehouseId !== undefined ? { warehouseId } : {}),
      },
      orderBy: [{ warehouseId: 'asc' }, { locationId: 'asc' }],
    });
  },

  listAvailableBatches(
    db: Db,
    args: { warehouseId: bigint; goodsId: bigint; locationId?: bigint },
  ) {
    return db.stock.findMany({
      where: {
        warehouseId: args.warehouseId,
        goodsId: args.goodsId,
        ...(args.locationId !== undefined ? { locationId: args.locationId } : {}),
      },
      orderBy: { id: 'asc' },
    });
  },

  /**
   * Ensure a stock slot exists for the (wh, loc, goods, batch) combination,
   * creating one with zero quantities if not present.  Returns the row.
   */
  async upsertSlot(db: Db, key: StockKey) {
    const batchNo = key.batch ?? '';
    return db.stock.upsert({
      where: {
        warehouseId_locationId_goodsId_batchNo: {
          warehouseId: key.wh,
          locationId: key.loc,
          goodsId: key.goods,
          batchNo,
        },
      },
      update: {},
      create: {
        warehouseId: key.wh,
        locationId: key.loc,
        goodsId: key.goods,
        batchNo,
        qtyOnHand: '0',
        qtyLocked: '0',
        qtyAvailable: '0',
        qtyInTransit: '0',
      },
    });
  },

  /** Add to qtyOnHand and recompute qtyAvailable. */
  async addOnHand(db: Db, stockId: bigint, deltaStr: string) {
    const cur = await db.stock.findUnique({ where: { id: stockId } });
    if (!cur) throw new Error('NOT_FOUND');
    const newOnHand = addDec(cur.qtyOnHand, deltaStr);
    const newAvailable = recomputeAvailable(newOnHand, cur.qtyLocked, cur.qtyInTransit);
    return db.stock.update({
      where: { id: stockId },
      data: {
        qtyOnHand: newOnHand,
        qtyAvailable: newAvailable,
        version: { increment: 1 },
      },
    });
  },

  /** Subtract from qtyOnHand and recompute qtyAvailable. */
  async subOnHand(db: Db, stockId: bigint, deltaStr: string) {
    const cur = await db.stock.findUnique({ where: { id: stockId } });
    if (!cur) throw new Error('NOT_FOUND');
    const newOnHand = subDec(cur.qtyOnHand, deltaStr);
    const newAvailable = recomputeAvailable(newOnHand, cur.qtyLocked, cur.qtyInTransit);
    return db.stock.update({
      where: { id: stockId },
      data: {
        qtyOnHand: newOnHand,
        qtyAvailable: newAvailable,
        version: { increment: 1 },
      },
    });
  },

  /** Move qty from available to locked: qtyLocked += delta, qtyAvailable -= delta. */
  async lockQty(db: Db, stockId: bigint, deltaStr: string) {
    const cur = await db.stock.findUnique({ where: { id: stockId } });
    if (!cur) throw new Error('NOT_FOUND');
    const newLocked = addDec(cur.qtyLocked, deltaStr);
    const newAvailable = recomputeAvailable(cur.qtyOnHand, newLocked, cur.qtyInTransit);
    return db.stock.update({
      where: { id: stockId },
      data: {
        qtyLocked: newLocked,
        qtyAvailable: newAvailable,
        version: { increment: 1 },
      },
    });
  },

  /** Move qty from locked back to available: qtyLocked -= delta. */
  async releaseQty(db: Db, stockId: bigint, deltaStr: string) {
    const cur = await db.stock.findUnique({ where: { id: stockId } });
    if (!cur) throw new Error('NOT_FOUND');
    const newLocked = subDec(cur.qtyLocked, deltaStr);
    const newAvailable = recomputeAvailable(cur.qtyOnHand, newLocked, cur.qtyInTransit);
    return db.stock.update({
      where: { id: stockId },
      data: {
        qtyLocked: newLocked,
        qtyAvailable: newAvailable,
        version: { increment: 1 },
      },
    });
  },

  /**
   * Add to qtyInTransit and recompute qtyAvailable.
   * Used by transfer.audit to mark qty as "在途" on the destination slot.
   */
  async addInTransit(db: Db, stockId: bigint, deltaStr: string) {
    const cur = await db.stock.findUnique({ where: { id: stockId } });
    if (!cur) throw new Error('NOT_FOUND');
    const newInTransit = addDec(cur.qtyInTransit, deltaStr);
    const newAvailable = recomputeAvailable(cur.qtyOnHand, cur.qtyLocked, newInTransit);
    return db.stock.update({
      where: { id: stockId },
      data: {
        qtyInTransit: newInTransit,
        qtyAvailable: newAvailable,
        version: { increment: 1 },
      },
    });
  },

  /**
   * Subtract from qtyInTransit and recompute qtyAvailable.
   * Used by transfer.receive to drain "在途" once goods arrive.
   */
  async subInTransit(db: Db, stockId: bigint, deltaStr: string) {
    const cur = await db.stock.findUnique({ where: { id: stockId } });
    if (!cur) throw new Error('NOT_FOUND');
    const newInTransit = subDec(cur.qtyInTransit, deltaStr);
    const newAvailable = recomputeAvailable(cur.qtyOnHand, cur.qtyLocked, newInTransit);
    return db.stock.update({
      where: { id: stockId },
      data: {
        qtyInTransit: newInTransit,
        qtyAvailable: newAvailable,
        version: { increment: 1 },
      },
    });
  },

  async summary(
    db: Db,
    input?: { warehouseId?: bigint; categoryId?: bigint },
  ) {
    const where: Prisma.StockWhereInput = {
      ...(input?.warehouseId !== undefined
        ? { warehouseId: input.warehouseId }
        : {}),
      ...(input?.categoryId !== undefined
        ? { goods: { categoryId: input.categoryId } }
        : {}),
    };
    const rows = await db.stock.findMany({
      where,
      select: {
        goodsId: true,
        qtyOnHand: true,
        qtyLocked: true,
        qtyAvailable: true,
        qtyInTransit: true,
      },
    });
    const goodsSet = new Set<string>();
    let totalOnHand = '0';
    let totalLocked = '0';
    let totalAvailable = '0';
    let totalInTransit = '0';
    for (const r of rows) {
      goodsSet.add(r.goodsId.toString());
      totalOnHand = addDec(totalOnHand, r.qtyOnHand);
      totalLocked = addDec(totalLocked, r.qtyLocked);
      totalAvailable = addDec(totalAvailable, r.qtyAvailable);
      totalInTransit = addDec(totalInTransit, r.qtyInTransit);
    }
    return {
      totalGoods: goodsSet.size,
      totalOnHand,
      totalLocked,
      totalAvailable,
      totalInTransit,
    };
  },
};
