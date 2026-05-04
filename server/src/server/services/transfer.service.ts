import { Prisma } from '@prisma/client';
import { runInTransaction } from '@/lib/tx';
import { TRPCError } from '@trpc/server';
import type { AppContext } from '../context';
import type { Db } from '../repositories/_base';
import { transferRepo } from '../repositories/transfer.repo';
import { warehouseRepo } from '../repositories/warehouse.repo';
import { locationRepo } from '../repositories/location.repo';
import { stockRepo } from '../repositories/stock.repo';
import { stockLogRepo } from '../repositories/stockLog.repo';
import { auditService } from './audit.service';
import { validateTransition } from './stateMachine.service';
import { genDocNo } from './docNo.service';
import { applyDelta } from './stock.math';

// ============================================================
// State constants for Transfer
//   10 = draft, 20 = submitted, 25 = audited (issued from source +
//                                              accrued to destination as in-transit),
//   30 = received (in-transit drained, on-hand credited), 40 = finished, 90 = void
// ============================================================
const STATUS_DRAFT = 10;
const STATUS_SUBMITTED = 20;
const STATUS_AUDITED = 25;
const STATUS_RECEIVED = 30;
const STATUS_FINISHED = 40;
const STATUS_VOID = 90;

// ============================================================
// Helpers
// ============================================================

function isPositiveDecimal(qty: string): boolean {
  if (!/^\d+(\.\d{1,4})?$/.test(qty)) return false;
  if (/^0+(\.0+)?$/.test(qty)) return false;
  return true;
}

function ensureLineQty(qty: string): void {
  if (!isPositiveDecimal(qty)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'INVALID_LINE_QTY',
    });
  }
}

function negSign(s: string): string {
  if (typeof s !== 'string') s = String(s);
  return s.startsWith('-') ? s.slice(1) : `-${s}`;
}

function publicView<T>(row: T): T {
  return row;
}

function tryTransition(from: number, to: number): void {
  try {
    validateTransition('Transfer', from, to);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith('ILLEGAL_TRANSITION')) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'ILLEGAL_TRANSITION' });
    }
    throw e;
  }
}

/**
 * Compare two decimal strings. Returns -1 / 0 / 1 (a vs b).
 */
function cmpDecimal(a: string, b: string): number {
  const SCALE = 10000n;
  const parse = (s: string): bigint => {
    let v = typeof s === 'string' ? s : String(s);
    const neg = v.startsWith('-');
    if (neg) v = v.slice(1);
    const [intPart, fracPart = ''] = v.split('.');
    const frac = (fracPart + '0000').slice(0, 4);
    const raw = BigInt(intPart || '0') * SCALE + BigInt(frac || '0');
    return neg ? -raw : raw;
  };
  const av = parse(a);
  const bv = parse(b);
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
}

async function ensureGoodsExist(db: Db, goodsIds: bigint[]) {
  if (goodsIds.length === 0) return;
  const uniq = Array.from(new Set(goodsIds.map((x) => x.toString()))).map(
    (x) => BigInt(x),
  );
  const found = await db.goods.findMany({
    where: { id: { in: uniq }, deletedAt: null },
  });
  if (found.length !== uniq.length) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'GOODS_NOT_FOUND',
    });
  }
}

async function ensureLocationBelongsTo(
  db: Db,
  warehouseId: bigint,
  locationId: bigint,
  errMsg = 'LOCATION_NOT_IN_WAREHOUSE',
): Promise<void> {
  const loc = await locationRepo.findById(db, locationId);
  if (!loc) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'LOCATION_NOT_FOUND',
    });
  }
  if (loc.warehouseId !== warehouseId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: errMsg,
    });
  }
}

async function ensureWarehouseExists(db: Db, warehouseId: bigint): Promise<void> {
  const wh = await warehouseRepo.findById(db, warehouseId);
  if (!wh) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'WAREHOUSE_NOT_FOUND',
    });
  }
}

/**
 * Generate a unique transfer document number using the 'DB' prefix (调拨).
 * Mirrors the inbound/outbound implementations: a daily counter scoped to the
 * operationAt date, with retry to handle concurrent collisions.
 */
async function genTransferDocNo(db: Db, when: Date): Promise<string> {
  const start = new Date(when);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const todayCount = await db.transfer.count({
    where: { createdAt: { gte: start, lt: end } },
  });
  for (let i = todayCount + 1; i < todayCount + 50; i++) {
    const candidate = genDocNo('DB', i, when);
    const dup = await db.transfer.findUnique({ where: { docNo: candidate } });
    if (!dup) return candidate;
  }
  throw new TRPCError({
    code: 'CONFLICT',
    message: 'CANNOT_ALLOCATE_DOC_NO',
  });
}

// ============================================================
// transferService
//
// Lifecycle:
//   create(10) → submit(20) → audit(25, issue from-warehouse + accrue
//                                      in-transit at to-warehouse)
//                          → receive(30, credit to-warehouse on-hand,
//                                        drain in-transit) → finish(40)
//                          \_ void(90) [from 10/20 only, no stock side effect]
//
// In-transit ledger choice (F-IM-05):
//   We do NOT introduce a separate "virtual" stock row.  Instead we use the
//   destination Stock slot's `qtyInTransit` column as the in-transit ledger.
//   - audit (20→25): subOnHand on the source slot, addInTransit on the
//     destination slot (creating it if needed).
//   - receive (25→30): addOnHand by `actualReceived` on the destination slot,
//     and subInTransit by the full `shippedQty`.  If receivedQty < shippedQty,
//     the difference is recorded as a separate StockLog entry (TRANSFER_LOSS)
//     for traceability — see receive() body.
// ============================================================

export const transferService = {
  async create(
    ctx: AppContext,
    input: {
      kind: string;
      fromWarehouseId: bigint;
      fromLocationId: bigint;
      toWarehouseId: bigint;
      toLocationId: bigint;
      applicantId?: bigint;
      operatorId: bigint;
      operationAt: Date;
      reason?: string;
      remark?: string;
      lines: Array<{
        goodsId: bigint;
        batchNo?: string;
        qty: string;
        shippedQty?: string;
        receivedQty?: string;
      }>;
    },
  ) {
    // Validate from/to warehouses exist and differ.
    if (input.fromWarehouseId === input.toWarehouseId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'INVALID_TRANSFER_TARGET',
      });
    }
    await ensureWarehouseExists(ctx.prisma, input.fromWarehouseId);
    await ensureWarehouseExists(ctx.prisma, input.toWarehouseId);

    // Validate locations belong to their respective warehouses.
    await ensureLocationBelongsTo(
      ctx.prisma,
      input.fromWarehouseId,
      input.fromLocationId,
      'FROM_LOCATION_NOT_IN_WAREHOUSE',
    );
    await ensureLocationBelongsTo(
      ctx.prisma,
      input.toWarehouseId,
      input.toLocationId,
      'TO_LOCATION_NOT_IN_WAREHOUSE',
    );

    // Validate lines
    for (const l of input.lines) {
      ensureLineQty(l.qty);
    }
    await ensureGoodsExist(
      ctx.prisma,
      input.lines.map((l) => l.goodsId),
    );

    const created = await runInTransaction(ctx.prisma, async (tx) => {
      const docNo = await genTransferDocNo(tx as unknown as Db, input.operationAt);
      return transferRepo.create(tx, {
        header: {
          docNo,
          kind: input.kind,
          fromWarehouseId: input.fromWarehouseId,
          fromLocationId: input.fromLocationId,
          toWarehouseId: input.toWarehouseId,
          toLocationId: input.toLocationId,
          applicantId: input.applicantId ?? null,
          operatorId: input.operatorId,
          operationAt: input.operationAt,
          reason: input.reason ?? null,
          remark: input.remark ?? null,
          status: STATUS_DRAFT,
        },
        lines: input.lines.map((l) => ({
          goodsId: l.goodsId,
          batchNo: l.batchNo,
          qty: l.qty,
          shippedQty: l.shippedQty ?? null,
          receivedQty: l.receivedQty ?? null,
        })),
      });
    });
    await auditService.log(ctx, {
      entity: 'Transfer',
      entityId: created.id,
      actionType: 'CREATE',
      after: { id: created.id, docNo: created.docNo, status: created.status },
    });
    return publicView(created);
  },

  async update(
    ctx: AppContext,
    input: {
      id: bigint;
      version: number;
      kind?: string;
      fromWarehouseId?: bigint;
      fromLocationId?: bigint;
      toWarehouseId?: bigint;
      toLocationId?: bigint;
      applicantId?: bigint;
      operatorId?: bigint;
      operationAt?: Date;
      reason?: string;
      remark?: string;
    },
  ) {
    const before = await transferRepo.findById(ctx.prisma, input.id);
    if (!before) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'TRANSFER_NOT_FOUND' });
    }
    if (before.status !== STATUS_DRAFT) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'IMMUTABLE_AFTER_AUDIT',
      });
    }
    // If the from/to warehouses are being changed, re-validate.
    const nextFromWh = input.fromWarehouseId ?? before.fromWarehouseId;
    const nextToWh = input.toWarehouseId ?? before.toWarehouseId;
    if (nextFromWh === nextToWh) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'INVALID_TRANSFER_TARGET',
      });
    }
    if (input.fromWarehouseId !== undefined) {
      await ensureWarehouseExists(ctx.prisma, input.fromWarehouseId);
    }
    if (input.toWarehouseId !== undefined) {
      await ensureWarehouseExists(ctx.prisma, input.toWarehouseId);
    }
    if (input.fromLocationId !== undefined) {
      await ensureLocationBelongsTo(
        ctx.prisma,
        nextFromWh,
        input.fromLocationId,
        'FROM_LOCATION_NOT_IN_WAREHOUSE',
      );
    }
    if (input.toLocationId !== undefined) {
      await ensureLocationBelongsTo(
        ctx.prisma,
        nextToWh,
        input.toLocationId,
        'TO_LOCATION_NOT_IN_WAREHOUSE',
      );
    }

    const data: Prisma.TransferUncheckedUpdateInput = {
      kind: input.kind ?? undefined,
      fromWarehouseId: input.fromWarehouseId ?? undefined,
      fromLocationId: input.fromLocationId ?? undefined,
      toWarehouseId: input.toWarehouseId ?? undefined,
      toLocationId: input.toLocationId ?? undefined,
      applicantId: input.applicantId ?? undefined,
      operatorId: input.operatorId ?? undefined,
      operationAt: input.operationAt ?? undefined,
      reason: input.reason ?? undefined,
      remark: input.remark ?? undefined,
    };
    const count = await transferRepo.updateOptimistic(
      ctx.prisma,
      input.id,
      input.version,
      data as Prisma.TransferUpdateInput,
    );
    if (count === 0) {
      throw new TRPCError({ code: 'CONFLICT', message: '版本冲突或记录不存在' });
    }
    const after = await transferRepo.findById(ctx.prisma, input.id);
    await auditService.log(ctx, {
      entity: 'Transfer',
      entityId: input.id,
      actionType: 'UPDATE',
      before,
      after,
    });
    return publicView(after!);
  },

  async list(
    ctx: AppContext,
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
    return transferRepo.findPage(ctx.prisma, input);
  },

  async detail(ctx: AppContext, id: bigint) {
    const r = await transferRepo.findByIdWithLines(ctx.prisma, id);
    if (!r) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'TRANSFER_NOT_FOUND' });
    }
    return publicView(r);
  },

  async listLines(ctx: AppContext, transferId: bigint) {
    const r = await transferRepo.findById(ctx.prisma, transferId);
    if (!r) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'TRANSFER_NOT_FOUND' });
    }
    return transferRepo.findLines(ctx.prisma, transferId);
  },

  async addLine(
    ctx: AppContext,
    input: {
      transferId: bigint;
      goodsId: bigint;
      batchNo?: string;
      qty: string;
      shippedQty?: string;
      receivedQty?: string;
    },
  ) {
    const head = await transferRepo.findById(ctx.prisma, input.transferId);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'TRANSFER_NOT_FOUND' });
    }
    if (head.status !== STATUS_DRAFT) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'IMMUTABLE_AFTER_AUDIT',
      });
    }
    ensureLineQty(input.qty);
    await ensureGoodsExist(ctx.prisma, [input.goodsId]);

    const line = await transferRepo.addLine(ctx.prisma, input.transferId, {
      goodsId: input.goodsId,
      batchNo: input.batchNo,
      qty: input.qty,
      shippedQty: input.shippedQty ?? null,
      receivedQty: input.receivedQty ?? null,
    });
    await auditService.log(ctx, {
      entity: 'TransferLine',
      entityId: line.id,
      actionType: 'CREATE',
      after: line,
    });
    return publicView(line);
  },

  async updateLine(
    ctx: AppContext,
    input: {
      id: bigint;
      goodsId?: bigint;
      batchNo?: string;
      qty?: string;
      shippedQty?: string;
      receivedQty?: string;
    },
  ) {
    const before = await transferRepo.findLineById(ctx.prisma, input.id);
    if (!before) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'LINE_NOT_FOUND' });
    }
    const head = await transferRepo.findById(ctx.prisma, before.transferId);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'TRANSFER_NOT_FOUND' });
    }
    // Allow updating receivedQty even after audit (so receive can pick it up)
    // — but everything else (qty / goodsId / batchNo / shippedQty) is locked
    // once the document leaves draft.  (The integration test calls
    // updateLine({ receivedQty }) on an audited (status=25) doc.)
    const isOnlyReceivedQty =
      input.goodsId === undefined &&
      input.batchNo === undefined &&
      input.qty === undefined &&
      input.shippedQty === undefined &&
      input.receivedQty !== undefined;
    if (head.status !== STATUS_DRAFT && !isOnlyReceivedQty) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'IMMUTABLE_AFTER_AUDIT',
      });
    }
    if (input.qty !== undefined) ensureLineQty(input.qty);
    if (input.goodsId !== undefined) {
      await ensureGoodsExist(ctx.prisma, [input.goodsId]);
    }
    const data: Prisma.TransferLineUncheckedUpdateInput = {
      goodsId: input.goodsId ?? undefined,
      batchNo: input.batchNo ?? undefined,
      qty: input.qty ?? undefined,
      shippedQty: input.shippedQty ?? undefined,
      receivedQty: input.receivedQty ?? undefined,
    };
    const updated = await transferRepo.updateLine(
      ctx.prisma,
      input.id,
      data as Prisma.TransferLineUpdateInput,
    );
    await auditService.log(ctx, {
      entity: 'TransferLine',
      entityId: input.id,
      actionType: 'UPDATE',
      before,
      after: updated,
    });
    return publicView(updated);
  },

  async removeLine(ctx: AppContext, id: bigint) {
    const line = await transferRepo.findLineById(ctx.prisma, id);
    if (!line) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'LINE_NOT_FOUND' });
    }
    const head = await transferRepo.findById(ctx.prisma, line.transferId);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'TRANSFER_NOT_FOUND' });
    }
    if (head.status !== STATUS_DRAFT) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'IMMUTABLE_AFTER_AUDIT',
      });
    }
    await transferRepo.removeLine(ctx.prisma, id);
    await auditService.log(ctx, {
      entity: 'TransferLine',
      entityId: id,
      actionType: 'DELETE',
      before: line,
    });
    return { ok: true as const };
  },

  async delete(ctx: AppContext, id: bigint) {
    const head = await transferRepo.findById(ctx.prisma, id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'TRANSFER_NOT_FOUND' });
    }
    if (head.status !== STATUS_DRAFT && head.status !== STATUS_VOID) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'CANNOT_DELETE_NON_DRAFT',
      });
    }
    await transferRepo.delete(ctx.prisma, id);
    await auditService.log(ctx, {
      entity: 'Transfer',
      entityId: id,
      actionType: 'DELETE',
      before: head,
    });
    return { ok: true as const };
  },

  /**
   * Generic transition router. Validates the move via the state machine and
   * dispatches to the corresponding side-effect method.
   */
  async transition(
    ctx: AppContext,
    input: { id: bigint; from: number; to: number; reason?: string },
  ) {
    const head = await transferRepo.findById(ctx.prisma, input.id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'TRANSFER_NOT_FOUND' });
    }
    if (head.status !== input.from) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'STATE_MISMATCH',
      });
    }
    if (input.from === STATUS_DRAFT && input.to === STATUS_SUBMITTED) {
      return this.submit(ctx, input.id);
    }
    if (input.from === STATUS_SUBMITTED && input.to === STATUS_AUDITED) {
      return this.audit(ctx, input.id);
    }
    if (input.from === STATUS_AUDITED && input.to === STATUS_RECEIVED) {
      return this.receive(ctx, input.id);
    }
    if (input.from === STATUS_RECEIVED && input.to === STATUS_FINISHED) {
      return this.finish(ctx, input.id);
    }
    if (input.to === STATUS_VOID) {
      return this.void(ctx, input.id);
    }
    tryTransition(input.from, input.to);
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'ILLEGAL_TRANSITION' });
  },

  /**
   * 10 → 20: submit.  Pure status flip + audit log.
   * Stock checks happen at audit time (per F-IM-05 design); a draft may be
   * submitted even if stock isn't yet sufficient — the audit step rejects it.
   */
  async submit(ctx: AppContext, id: bigint) {
    const head = await transferRepo.findById(ctx.prisma, id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'TRANSFER_NOT_FOUND' });
    }
    tryTransition(head.status, STATUS_SUBMITTED);
    const operatorId = ctx.user?.id ?? head.operatorId;
    const updated = await transferRepo.setStatus(
      ctx.prisma,
      id,
      STATUS_SUBMITTED,
      operatorId,
    );
    await auditService.log(ctx, {
      entity: 'Transfer',
      entityId: id,
      actionType: 'SUBMIT',
      before: { status: head.status },
      after: { status: STATUS_SUBMITTED },
    });
    return publicView(updated);
  },

  /**
   * 20 → 25: audit.  For each line:
   *   - Locate the source slot at (fromWarehouseId, fromLocationId, goodsId,
   *     batchNo).  If it doesn't exist or qtyOnHand < line.qty, throw
   *     PRECONDITION_FAILED:INSUFFICIENT_STOCK.
   *   - subOnHand on the source.
   *   - Upsert the destination slot at (toWarehouseId, toLocationId, goodsId,
   *     batchNo) and addInTransit by line.qty.
   *   - Append a TRANSFER_OUT StockLog row (negative qty_change) on the source.
   *   - Persist `shippedQty = line.qty` on the line so receive can default to
   *     it when no explicit receivedQty is provided.
   */
  async audit(ctx: AppContext, id: bigint) {
    const head = await transferRepo.findByIdWithLines(ctx.prisma, id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'TRANSFER_NOT_FOUND' });
    }
    tryTransition(head.status, STATUS_AUDITED);
    const operatorId = ctx.user?.id ?? head.operatorId;

    const updated = await runInTransaction(ctx.prisma, async (tx) => {
      for (const line of head.lines) {
        // Locate source slot
        const fromSlot = await stockRepo.findOneByKey(tx as unknown as Db, {
          wh: head.fromWarehouseId,
          loc: head.fromLocationId,
          goods: line.goodsId,
          batch: line.batchNo ?? '',
        });
        if (!fromSlot) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'INSUFFICIENT_STOCK',
          });
        }
        // Pre-validate via pure math.
        try {
          applyDelta(fromSlot.qtyOnHand, negSign(line.qty));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg === 'NEGATIVE_STOCK') {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'INSUFFICIENT_STOCK',
            });
          }
          throw e;
        }
        if (cmpDecimal(fromSlot.qtyOnHand, line.qty) < 0) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'INSUFFICIENT_STOCK',
          });
        }

        const beforeFromOnHand = fromSlot.qtyOnHand;
        const afterSub = await stockRepo.subOnHand(
          tx as unknown as Db,
          fromSlot.id,
          line.qty,
        );

        // Upsert + accrue in-transit on destination
        const toSlot = await stockRepo.upsertSlot(tx as unknown as Db, {
          wh: head.toWarehouseId,
          loc: head.toLocationId,
          goods: line.goodsId,
          batch: line.batchNo ?? '',
        });
        await stockRepo.addInTransit(
          tx as unknown as Db,
          toSlot.id,
          line.qty,
        );

        // Append TRANSFER_OUT log on source
        await stockLogRepo.append(tx as unknown as Db, {
          stockId: fromSlot.id,
          warehouseId: fromSlot.warehouseId,
          goodsId: fromSlot.goodsId,
          changeType: 'TRANSFER_OUT',
          qtyBefore: beforeFromOnHand,
          qtyChange: negSign(line.qty),
          qtyAfter: afterSub.qtyOnHand,
          refDocNo: head.docNo,
          operatorId,
        });

        // Record the shipped qty on the line so receive() can default to it.
        await transferRepo.updateLine(tx as unknown as Db, line.id, {
          shippedQty: line.qty,
        });
      }
      return transferRepo.setStatus(tx, id, STATUS_AUDITED, operatorId);
    });

    await auditService.log(ctx, {
      entity: 'Transfer',
      entityId: id,
      actionType: 'AUDIT',
      before: { status: head.status },
      after: { status: STATUS_AUDITED },
    });
    return publicView(updated);
  },

  /**
   * 25 → 30: receive.  Drains in-transit on the destination slot and credits
   * its on-hand by the actual received qty.
   *
   *   actualReceived = line.receivedQty ?? line.shippedQty ?? line.qty
   *
   * subInTransit always uses the FULL `shippedQty` (we are draining what
   * audit accrued).  If actualReceived < shippedQty, the gap is logged as a
   * separate TRANSFER_LOSS StockLog entry (qty_change = -gap) on the
   * destination slot for traceability.
   */
  async receive(ctx: AppContext, id: bigint) {
    const head = await transferRepo.findByIdWithLines(ctx.prisma, id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'TRANSFER_NOT_FOUND' });
    }
    tryTransition(head.status, STATUS_RECEIVED);
    const operatorId = ctx.user?.id ?? head.operatorId;

    const updated = await runInTransaction(ctx.prisma, async (tx) => {
      for (const line of head.lines) {
        const shippedQty = line.shippedQty ?? line.qty;
        const actualReceived = line.receivedQty ?? shippedQty;

        // Locate destination slot (must exist — audit upserted it).
        const toSlot = await stockRepo.findOneByKey(tx as unknown as Db, {
          wh: head.toWarehouseId,
          loc: head.toLocationId,
          goods: line.goodsId,
          batch: line.batchNo ?? '',
        });
        if (!toSlot) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'TO_STOCK_NOT_FOUND',
          });
        }

        const beforeOnHand = toSlot.qtyOnHand;
        const afterAdd = await stockRepo.addOnHand(
          tx as unknown as Db,
          toSlot.id,
          actualReceived,
        );

        // Drain in-transit by the FULL shippedQty (audit-accrued amount).
        await stockRepo.subInTransit(
          tx as unknown as Db,
          toSlot.id,
          shippedQty,
        );

        // Append TRANSFER_IN log on destination (positive qty_change).
        await stockLogRepo.append(tx as unknown as Db, {
          stockId: toSlot.id,
          warehouseId: toSlot.warehouseId,
          goodsId: toSlot.goodsId,
          changeType: 'TRANSFER_IN',
          qtyBefore: beforeOnHand,
          qtyChange: actualReceived,
          qtyAfter: afterAdd.qtyOnHand,
          refDocNo: head.docNo,
          operatorId,
        });

        // If short-received, append a TRANSFER_LOSS log with the gap.
        if (cmpDecimal(actualReceived, shippedQty) < 0) {
          // gap = shippedQty - actualReceived
          const gap = applyDelta(shippedQty, negSign(actualReceived));
          await stockLogRepo.append(tx as unknown as Db, {
            stockId: toSlot.id,
            warehouseId: toSlot.warehouseId,
            goodsId: toSlot.goodsId,
            changeType: 'TRANSFER_LOSS',
            qtyBefore: afterAdd.qtyOnHand,
            qtyChange: negSign(gap),
            qtyAfter: afterAdd.qtyOnHand,
            refDocNo: head.docNo,
            operatorId,
          });
        }
      }
      return transferRepo.setStatus(tx, id, STATUS_RECEIVED, operatorId);
    });

    await auditService.log(ctx, {
      entity: 'Transfer',
      entityId: id,
      actionType: 'RECEIVE',
      before: { status: head.status },
      after: { status: STATUS_RECEIVED },
    });
    return publicView(updated);
  },

  /**
   * 30 → 40: finish.  Pure status flip + audit log.
   */
  async finish(ctx: AppContext, id: bigint) {
    const head = await transferRepo.findById(ctx.prisma, id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'TRANSFER_NOT_FOUND' });
    }
    tryTransition(head.status, STATUS_FINISHED);
    const operatorId = ctx.user?.id ?? head.operatorId;
    const updated = await transferRepo.setStatus(
      ctx.prisma,
      id,
      STATUS_FINISHED,
      operatorId,
    );
    await auditService.log(ctx, {
      entity: 'Transfer',
      entityId: id,
      actionType: 'FINISH',
      before: { status: head.status },
      after: { status: STATUS_FINISHED },
    });
    return publicView(updated);
  },

  /**
   * Void:
   *   - 10 / 20 → 90 : pure status flip (no stock side effect because
   *                    audit has not yet issued anything).
   *   - 25 / 30 / 40 → 90 : ILLEGAL_TRANSITION (audit/receive/finish would
   *                          require an explicit reversal flow which is
   *                          out of scope here).
   */
  async void(ctx: AppContext, id: bigint) {
    const head = await transferRepo.findById(ctx.prisma, id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'TRANSFER_NOT_FOUND' });
    }
    const fromState = head.status;
    if (fromState !== STATUS_DRAFT && fromState !== STATUS_SUBMITTED) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'ILLEGAL_TRANSITION',
      });
    }
    tryTransition(fromState, STATUS_VOID);
    const operatorId = ctx.user?.id ?? head.operatorId;
    const updated = await transferRepo.setStatus(
      ctx.prisma,
      id,
      STATUS_VOID,
      operatorId,
    );
    await auditService.log(ctx, {
      entity: 'Transfer',
      entityId: id,
      actionType: 'VOID',
      before: { status: fromState },
      after: { status: STATUS_VOID },
    });
    return publicView(updated);
  },
};
