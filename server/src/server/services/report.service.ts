import type { AppContext } from '../context';
import { stockMath } from './stock.math';

// ============================================================
// Report service
//
// Pure aggregation queries over existing entities.
// Read-only: no writes, no audit, no transactions, no state-machine.
//
// Strategy: aggregation is done in JS over Prisma findMany results
// rather than raw SQL, so that string-decimal columns (qtyOnHand,
// qtyLocked, qty, safetyStock, ...) are summed losslessly via
// stockMath.toRaw / stockMath.toStr.  At this scale (single-warehouse,
// thousands-of-rows) the cost is negligible and the code stays portable.
// ============================================================

const ONE_DAY_MS = 86_400_000;
const DEFAULT_RANGE_DAYS = 30;

const STATUS_OUTBOUND_SHIPPED = 30;

function addDecStr(a: string, b: string): string {
  return stockMath.toStr(stockMath.toRaw(a) + stockMath.toRaw(b));
}

function subDecStr(a: string, b: string): string {
  return stockMath.toStr(stockMath.toRaw(a) - stockMath.toRaw(b));
}

function cmpDecStr(a: string, b: string): number {
  const ra = stockMath.toRaw(a);
  const rb = stockMath.toRaw(b);
  if (ra < rb) return -1;
  if (ra > rb) return 1;
  return 0;
}

function isoDate(d: Date): string {
  // YYYY-MM-DD in UTC; stable across machines and consistent w/ DB rows.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function defaultRange(ctx: AppContext, from?: Date, to?: Date): { from: Date; to: Date } {
  const now = ctx.clock.now();
  const resolvedTo = to ?? now;
  const resolvedFrom = from ?? new Date(resolvedTo.getTime() - DEFAULT_RANGE_DAYS * ONE_DAY_MS);
  return { from: resolvedFrom, to: resolvedTo };
}

// ============================================================
// summary (JS aggregation over goods/warehouses/stocks/inbounds/...)
// ============================================================

interface SummaryInput {
  from?: Date;
  to?: Date;
  warehouseId?: bigint;
}

interface SummaryOutput {
  goodsCount: number;
  activeWarehouseCount: number;
  totalStockOnHand: string;
  lockedStockTotal: string;
  inboundCount: number;
  outboundCount: number;
  transferCount: number;
  stocktakeCount: number;
  lowStockCount: number;
}

async function summary(ctx: AppContext, input?: SummaryInput): Promise<SummaryOutput> {
  const { from, to } = defaultRange(ctx, input?.from, input?.to);
  const warehouseId = input?.warehouseId;

  // Active goods (not soft-deleted)
  const goodsCount = await ctx.prisma.goods.count({
    where: { status: 'ACTIVE', deletedAt: null },
  });

  // Active warehouses
  const activeWarehouseCount = await ctx.prisma.warehouse.count({
    where: { status: 'ACTIVE', deletedAt: null },
  });

  // Sum stock.qtyOnHand and stock.qtyLocked over scope
  const stockRows = await ctx.prisma.stock.findMany({
    where: warehouseId !== undefined ? { warehouseId } : {},
    select: { goodsId: true, qtyOnHand: true, qtyLocked: true },
  });
  let totalStockOnHand = '0';
  let lockedStockTotal = '0';
  for (const row of stockRows) {
    totalStockOnHand = addDecStr(totalStockOnHand, row.qtyOnHand);
    lockedStockTotal = addDecStr(lockedStockTotal, row.qtyLocked);
  }

  const dateScope = { createdAt: { gte: from, lte: to } };
  const whScope = warehouseId !== undefined ? { warehouseId } : {};

  const [inboundCount, outboundCount, stocktakeCount] = await Promise.all([
    ctx.prisma.inbound.count({ where: { ...dateScope, ...whScope } }),
    ctx.prisma.outbound.count({ where: { ...dateScope, ...whScope } }),
    ctx.prisma.stocktake.count({ where: { ...dateScope, ...whScope } }),
  ]);

  // Transfer is filtered by either origin OR destination warehouse (if set).
  const transferCount = await ctx.prisma.transfer.count({
    where: {
      ...dateScope,
      ...(warehouseId !== undefined
        ? {
            OR: [
              { fromWarehouseId: warehouseId },
              { toWarehouseId: warehouseId },
            ],
          }
        : {}),
    },
  });

  // lowStockCount: aggregate Stock per goodsId (sum qtyOnHand) and
  // compare to goods.safetyStock.  Only count goods with safetyStock > 0.
  const goodsWithSafety = await ctx.prisma.goods.findMany({
    where: { status: 'ACTIVE', deletedAt: null, NOT: { safetyStock: null } },
    select: { id: true, safetyStock: true },
  });
  const safetyById = new Map<string, string>();
  for (const g of goodsWithSafety) {
    if (g.safetyStock != null && cmpDecStr(g.safetyStock, '0') > 0) {
      safetyById.set(g.id.toString(), g.safetyStock);
    }
  }
  // Aggregate qtyOnHand per goods (already filtered by warehouse if set).
  const onHandByGoods = new Map<string, string>();
  for (const row of stockRows) {
    const k = row.goodsId.toString();
    const cur = onHandByGoods.get(k) ?? '0';
    onHandByGoods.set(k, addDecStr(cur, row.qtyOnHand));
  }
  let lowStockCount = 0;
  for (const [goodsId, safety] of safetyById) {
    const onHand = onHandByGoods.get(goodsId) ?? '0';
    if (cmpDecStr(onHand, safety) < 0) lowStockCount += 1;
  }

  return {
    goodsCount,
    activeWarehouseCount,
    totalStockOnHand,
    lockedStockTotal,
    inboundCount,
    outboundCount,
    transferCount,
    stocktakeCount,
    lowStockCount,
  };
}

// ============================================================
// dailyMovement (JS bucket aggregation)
// ============================================================

interface DailyMovementInput {
  from: Date;
  to: Date;
  warehouseId?: bigint;
}

interface DailyMovementRow {
  date: string;
  inboundQty: string;
  outboundQty: string;
}

async function dailyMovement(
  ctx: AppContext,
  input: DailyMovementInput,
): Promise<DailyMovementRow[]> {
  const fromDay = startOfUtcDay(input.from);
  const toDay = startOfUtcDay(input.to);
  if (toDay.getTime() < fromDay.getTime()) return [];

  const whScope = input.warehouseId !== undefined ? { warehouseId: input.warehouseId } : {};
  const dateScope = { operationAt: { gte: input.from, lte: input.to } };

  const [inboundLines, outboundLines] = await Promise.all([
    ctx.prisma.inboundLine.findMany({
      where: { inbound: { ...whScope, ...dateScope } },
      select: { qty: true, inbound: { select: { operationAt: true } } },
    }),
    ctx.prisma.outboundLine.findMany({
      where: { outbound: { ...whScope, ...dateScope } },
      select: { qty: true, outbound: { select: { operationAt: true } } },
    }),
  ]);

  const inboundByDay = new Map<string, string>();
  for (const ln of inboundLines) {
    const key = isoDate(ln.inbound.operationAt);
    inboundByDay.set(key, addDecStr(inboundByDay.get(key) ?? '0', ln.qty));
  }
  const outboundByDay = new Map<string, string>();
  for (const ln of outboundLines) {
    const key = isoDate(ln.outbound.operationAt);
    outboundByDay.set(key, addDecStr(outboundByDay.get(key) ?? '0', ln.qty));
  }

  const rows: DailyMovementRow[] = [];
  for (let t = fromDay.getTime(); t <= toDay.getTime(); t += ONE_DAY_MS) {
    const key = isoDate(new Date(t));
    rows.push({
      date: key,
      inboundQty: inboundByDay.get(key) ?? '0',
      outboundQty: outboundByDay.get(key) ?? '0',
    });
  }
  return rows;
}

// ============================================================
// topGoodsByMovement (JS aggregation + join via prisma.goods)
// ============================================================

interface TopGoodsInput {
  from: Date;
  to: Date;
  direction: 'INBOUND' | 'OUTBOUND' | 'BOTH';
  limit: number;
}

interface TopGoodsRow {
  goodsId: bigint;
  goodsCode: string;
  goodsName: string;
  totalIn: string;
  totalOut: string;
  netChange: string;
}

async function topGoodsByMovement(
  ctx: AppContext,
  input: TopGoodsInput,
): Promise<TopGoodsRow[]> {
  const dateScope = { operationAt: { gte: input.from, lte: input.to } };
  const wantIn = input.direction === 'INBOUND' || input.direction === 'BOTH';
  const wantOut = input.direction === 'OUTBOUND' || input.direction === 'BOTH';

  const totalsIn = new Map<string, string>();
  const totalsOut = new Map<string, string>();

  if (wantIn) {
    const inLines = await ctx.prisma.inboundLine.findMany({
      where: { inbound: { ...dateScope } },
      select: { goodsId: true, qty: true },
    });
    for (const ln of inLines) {
      const k = ln.goodsId.toString();
      totalsIn.set(k, addDecStr(totalsIn.get(k) ?? '0', ln.qty));
    }
  }
  if (wantOut) {
    const outLines = await ctx.prisma.outboundLine.findMany({
      where: { outbound: { ...dateScope } },
      select: { goodsId: true, qty: true },
    });
    for (const ln of outLines) {
      const k = ln.goodsId.toString();
      totalsOut.set(k, addDecStr(totalsOut.get(k) ?? '0', ln.qty));
    }
  }

  // Union of goodsIds appearing in either side
  const goodsIdSet = new Set<string>();
  for (const k of totalsIn.keys()) goodsIdSet.add(k);
  for (const k of totalsOut.keys()) goodsIdSet.add(k);
  if (goodsIdSet.size === 0) return [];

  const goodsRows = await ctx.prisma.goods.findMany({
    where: { id: { in: [...goodsIdSet].map((s) => BigInt(s)) } },
    select: { id: true, code: true, name: true },
  });
  const goodsMeta = new Map<string, { code: string; name: string }>();
  for (const g of goodsRows) {
    goodsMeta.set(g.id.toString(), { code: g.code, name: g.name });
  }

  const rows: TopGoodsRow[] = [];
  for (const k of goodsIdSet) {
    const totalIn = totalsIn.get(k) ?? '0';
    const totalOut = totalsOut.get(k) ?? '0';
    const meta = goodsMeta.get(k);
    if (!meta) continue;
    rows.push({
      goodsId: BigInt(k),
      goodsCode: meta.code,
      goodsName: meta.name,
      totalIn,
      totalOut,
      netChange: subDecStr(totalIn, totalOut),
    });
  }

  // Sort by direction-appropriate metric (desc), then by goodsId for stability.
  rows.sort((a, b) => {
    let cmp = 0;
    if (input.direction === 'INBOUND') {
      cmp = cmpDecStr(b.totalIn, a.totalIn);
    } else if (input.direction === 'OUTBOUND') {
      cmp = cmpDecStr(b.totalOut, a.totalOut);
    } else {
      cmp = cmpDecStr(addDecStr(b.totalIn, b.totalOut), addDecStr(a.totalIn, a.totalOut));
    }
    if (cmp !== 0) return cmp;
    return a.goodsId < b.goodsId ? -1 : a.goodsId > b.goodsId ? 1 : 0;
  });

  return rows.slice(0, input.limit);
}

// ============================================================
// slowMovingGoods (JS aggregation: goods × max(outboundLine))
// ============================================================

interface SlowMovingInput {
  days: number;
  warehouseId?: bigint;
  limit: number;
}

interface SlowMovingRow {
  goodsId: bigint;
  goodsCode: string;
  goodsName: string;
  qtyOnHand: string;
  lastOutboundAt: Date | null;
  daysSinceLastOutbound: number | null;
}

async function slowMovingGoods(
  ctx: AppContext,
  input: SlowMovingInput,
): Promise<SlowMovingRow[]> {
  const now = ctx.clock.now();
  const warehouseId = input.warehouseId;

  const goodsRows = await ctx.prisma.goods.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, name: true },
  });
  if (goodsRows.length === 0) return [];

  // Aggregate qtyOnHand per goods (filtered by warehouse if requested).
  const stockRows = await ctx.prisma.stock.findMany({
    where: warehouseId !== undefined ? { warehouseId } : {},
    select: { goodsId: true, qtyOnHand: true },
  });
  const onHandByGoods = new Map<string, string>();
  for (const row of stockRows) {
    const k = row.goodsId.toString();
    onHandByGoods.set(k, addDecStr(onHandByGoods.get(k) ?? '0', row.qtyOnHand));
  }

  // Find last shipped outbound per goods (status >= STATUS_OUTBOUND_SHIPPED).
  // We pull the operationAt + goodsId for matching outbound lines and
  // take max() in JS — works in both sqlite/postgres without raw SQL.
  const shippedLines = await ctx.prisma.outboundLine.findMany({
    where: {
      outbound: {
        status: { gte: STATUS_OUTBOUND_SHIPPED },
        ...(warehouseId !== undefined ? { warehouseId } : {}),
      },
    },
    select: {
      goodsId: true,
      outbound: { select: { operationAt: true } },
    },
  });
  const lastOutboundByGoods = new Map<string, Date>();
  for (const ln of shippedLines) {
    const k = ln.goodsId.toString();
    const prev = lastOutboundByGoods.get(k);
    const cur = ln.outbound.operationAt;
    if (!prev || cur.getTime() > prev.getTime()) {
      lastOutboundByGoods.set(k, cur);
    }
  }

  const thresholdMs = input.days * ONE_DAY_MS;
  const rows: SlowMovingRow[] = [];
  for (const g of goodsRows) {
    const k = g.id.toString();
    const lastOutboundAt = lastOutboundByGoods.get(k) ?? null;
    let daysSinceLastOutbound: number | null;
    if (lastOutboundAt) {
      const ms = now.getTime() - lastOutboundAt.getTime();
      daysSinceLastOutbound = Math.floor(ms / ONE_DAY_MS);
      if (ms < thresholdMs) continue; // not slow enough — skip
    } else {
      daysSinceLastOutbound = null;
    }
    rows.push({
      goodsId: g.id,
      goodsCode: g.code,
      goodsName: g.name,
      qtyOnHand: onHandByGoods.get(k) ?? '0',
      lastOutboundAt,
      daysSinceLastOutbound,
    });
  }

  // Sort: never-outbound first (null -> Infinity), then by days desc, then id.
  rows.sort((a, b) => {
    const da = a.daysSinceLastOutbound ?? Number.MAX_SAFE_INTEGER;
    const db = b.daysSinceLastOutbound ?? Number.MAX_SAFE_INTEGER;
    if (da !== db) return db - da;
    return a.goodsId < b.goodsId ? -1 : a.goodsId > b.goodsId ? 1 : 0;
  });

  return rows.slice(0, input.limit);
}

// ============================================================
// stockByWarehouse (JS aggregation per warehouse)
// ============================================================

interface StockByWarehouseRow {
  warehouseId: bigint;
  warehouseCode: string;
  warehouseName: string;
  skuCount: number;
  totalQty: string;
  totalLocked: string;
}

async function stockByWarehouse(ctx: AppContext): Promise<StockByWarehouseRow[]> {
  const warehouses = await ctx.prisma.warehouse.findMany({
    where: { status: 'ACTIVE', deletedAt: null },
    select: { id: true, code: true, name: true },
    orderBy: { id: 'asc' },
  });
  if (warehouses.length === 0) return [];

  const stockRows = await ctx.prisma.stock.findMany({
    where: { warehouseId: { in: warehouses.map((w) => w.id) } },
    select: {
      warehouseId: true,
      goodsId: true,
      qtyOnHand: true,
      qtyLocked: true,
    },
  });

  interface Bucket {
    skuSet: Set<string>;
    totalQty: string;
    totalLocked: string;
  }
  const byWarehouse = new Map<string, Bucket>();
  for (const row of stockRows) {
    const k = row.warehouseId.toString();
    let bucket = byWarehouse.get(k);
    if (!bucket) {
      bucket = { skuSet: new Set<string>(), totalQty: '0', totalLocked: '0' };
      byWarehouse.set(k, bucket);
    }
    bucket.skuSet.add(row.goodsId.toString());
    bucket.totalQty = addDecStr(bucket.totalQty, row.qtyOnHand);
    bucket.totalLocked = addDecStr(bucket.totalLocked, row.qtyLocked);
  }

  return warehouses.map((w) => {
    const bucket = byWarehouse.get(w.id.toString());
    return {
      warehouseId: w.id,
      warehouseCode: w.code,
      warehouseName: w.name,
      skuCount: bucket?.skuSet.size ?? 0,
      totalQty: bucket?.totalQty ?? '0',
      totalLocked: bucket?.totalLocked ?? '0',
    };
  });
}

// ============================================================
// Public surface
// ============================================================

export const reportService = {
  summary,
  dailyMovement,
  topGoodsByMovement,
  slowMovingGoods,
  stockByWarehouse,
};
