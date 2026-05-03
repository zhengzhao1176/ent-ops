import { TRPCError } from '@trpc/server';
import type { Db } from '../repositories/_base';
import { stockRepo } from '../repositories/stock.repo';
import { stockLogRepo } from '../repositories/stockLog.repo';
import { applyDelta } from './stock.math';

// ============================================================
// Helpers
// ============================================================

function negSign(s: string): string {
  if (typeof s !== 'string') s = String(s);
  return s.startsWith('-') ? s.slice(1) : `-${s}`;
}

function ensurePositiveDecimal(qty: string, label = 'qty'): void {
  if (!/^\d+(\.\d{1,4})?$/.test(qty)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `INVALID_DECIMAL:${label}`,
    });
  }
  // Check > 0 (string compare won't do; use applyDelta math implicitly)
  if (qty === '0' || /^0+(\.0+)?$/.test(qty)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `${label}_MUST_BE_POSITIVE`,
    });
  }
}

function publicView<T>(stock: T): T {
  return stock;
}

// ============================================================
// Stock orchestration service
//
// All stock mutations MUST go through this service so that:
//   - the (warehouseId, locationId, goodsId, batchNo) slot exists
//   - qtyOnHand never goes < 0 (validated via applyDelta)
//   - a StockLog row is appended for every change
// ============================================================

export const stockService = {
  /**
   * Apply an inbound effect: +qty to onHand at the given slot, plus log.
   * Returns the updated Stock row.
   */
  async applyInboundEffect(
    db: Db,
    args: {
      warehouseId: bigint;
      locationId: bigint;
      goodsId: bigint;
      batchNo?: string;
      qty: string;
      refDocNo?: string | null;
      operatorId?: bigint | null;
    },
  ) {
    ensurePositiveDecimal(args.qty, 'qty');
    const slot = await stockRepo.upsertSlot(db, {
      wh: args.warehouseId,
      loc: args.locationId,
      goods: args.goodsId,
      batch: args.batchNo,
    });
    // Pre-validate via pure math so we don't half-write on overflow.
    try {
      applyDelta(slot.qtyOnHand, args.qty);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'NEGATIVE_STOCK') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'NEGATIVE_STOCK' });
      }
      throw e;
    }
    const before = slot.qtyOnHand;
    const updated = await stockRepo.addOnHand(db, slot.id, args.qty);
    await stockLogRepo.append(db, {
      stockId: slot.id,
      warehouseId: args.warehouseId,
      goodsId: args.goodsId,
      changeType: 'INBOUND',
      qtyBefore: before,
      qtyChange: args.qty,
      qtyAfter: updated.qtyOnHand,
      refDocNo: args.refDocNo ?? null,
      operatorId: args.operatorId ?? null,
    });
    return publicView(updated);
  },

  /**
   * Apply an outbound effect: -qty from onHand at the given slot, plus log.
   * Throws PRECONDITION_FAILED:NEGATIVE_STOCK if the result would be < 0.
   */
  async applyOutboundEffect(
    db: Db,
    args: {
      warehouseId: bigint;
      locationId: bigint;
      goodsId: bigint;
      batchNo?: string;
      qty: string;
      refDocNo?: string | null;
      operatorId?: bigint | null;
    },
  ) {
    ensurePositiveDecimal(args.qty, 'qty');
    const slot = await stockRepo.findOneByKey(db, {
      wh: args.warehouseId,
      loc: args.locationId,
      goods: args.goodsId,
      batch: args.batchNo,
    });
    if (!slot) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'NEGATIVE_STOCK' });
    }
    try {
      applyDelta(slot.qtyOnHand, negSign(args.qty));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'NEGATIVE_STOCK') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'NEGATIVE_STOCK' });
      }
      throw e;
    }
    const before = slot.qtyOnHand;
    const updated = await stockRepo.subOnHand(db, slot.id, args.qty);
    await stockLogRepo.append(db, {
      stockId: slot.id,
      warehouseId: args.warehouseId,
      goodsId: args.goodsId,
      changeType: 'OUTBOUND',
      qtyBefore: before,
      qtyChange: negSign(args.qty),
      qtyAfter: updated.qtyOnHand,
      refDocNo: args.refDocNo ?? null,
      operatorId: args.operatorId ?? null,
    });
    return publicView(updated);
  },

  /**
   * Red-rebound (红冲) of a previously-applied inbound at a given stock slot.
   * Subtracts qty from onHand and logs a negative qty_change with changeType=RED_REVERSE.
   */
  async redReverseInbound(
    db: Db,
    args: {
      stockId: bigint;
      qty: string;
      refDocNo?: string | null;
      operatorId?: bigint | null;
    },
  ) {
    ensurePositiveDecimal(args.qty, 'qty');
    const slot = await stockRepo.findById(db, args.stockId);
    if (!slot) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'STOCK_NOT_FOUND' });
    }
    try {
      applyDelta(slot.qtyOnHand, negSign(args.qty));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'NEGATIVE_STOCK') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'NEGATIVE_STOCK' });
      }
      throw e;
    }
    const before = slot.qtyOnHand;
    const updated = await stockRepo.subOnHand(db, slot.id, args.qty);
    await stockLogRepo.append(db, {
      stockId: slot.id,
      warehouseId: slot.warehouseId,
      goodsId: slot.goodsId,
      changeType: 'RED_REVERSE',
      qtyBefore: before,
      qtyChange: negSign(args.qty),
      qtyAfter: updated.qtyOnHand,
      refDocNo: args.refDocNo ?? null,
      operatorId: args.operatorId ?? null,
    });
    return publicView(updated);
  },

  /**
   * Red-rebound by the slot key (warehouse/location/goods/batch).
   * Convenience wrapper used by inbound.void when reversing an audited
   * inbound: looks up the slot first, then delegates to redReverseInbound.
   */
  async redReverseInboundByKey(
    db: Db,
    args: {
      warehouseId: bigint;
      locationId: bigint;
      goodsId: bigint;
      batchNo?: string;
      qty: string;
      refDocNo?: string | null;
      operatorId?: bigint | null;
    },
  ) {
    const slot = await stockRepo.findOneByKey(db, {
      wh: args.warehouseId,
      loc: args.locationId,
      goods: args.goodsId,
      batch: args.batchNo,
    });
    if (!slot) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'STOCK_NOT_FOUND' });
    }
    return this.redReverseInbound(db, {
      stockId: slot.id,
      qty: args.qty,
      refDocNo: args.refDocNo ?? null,
      operatorId: args.operatorId ?? null,
    });
  },

  // ----- Read APIs (used by stock router) -----
  async list(
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
    return stockRepo.findPage(db, input);
  },

  async detail(db: Db, id: bigint) {
    const s = await stockRepo.findById(db, id);
    if (!s) throw new TRPCError({ code: 'NOT_FOUND', message: '库存不存在' });
    return publicView(s);
  },

  async summary(db: Db, input?: { warehouseId?: bigint; categoryId?: bigint }) {
    return stockRepo.summary(db, input);
  },
};
