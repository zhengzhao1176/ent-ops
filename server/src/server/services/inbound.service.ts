import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import type { AppContext } from '../context';
import type { Db } from '../repositories/_base';
import { inboundRepo } from '../repositories/inbound.repo';
import { goodsRepo } from '../repositories/goods.repo';
import { warehouseRepo } from '../repositories/warehouse.repo';
import { locationRepo } from '../repositories/location.repo';
import { auditService } from './audit.service';
import { stockService } from './stock.service';
import { validateTransition } from './stateMachine.service';
import { genDocNo } from './docNo.service';

// ============================================================
// State constants for Inbound
// ============================================================
const STATUS_DRAFT = 10;
const STATUS_SUBMITTED = 20;
const STATUS_AUDITED = 30;
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

function publicView<T>(row: T): T {
  return row;
}

async function ensureLocationsBelongTo(
  db: Db,
  warehouseId: bigint,
  locationIds: bigint[],
) {
  if (locationIds.length === 0) return;
  const uniq = Array.from(new Set(locationIds.map((x) => x.toString()))).map(
    (x) => BigInt(x),
  );
  const found = await db.location.findMany({
    where: { id: { in: uniq }, deletedAt: null },
  });
  if (found.length !== uniq.length) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'LOCATION_NOT_FOUND',
    });
  }
  for (const l of found) {
    if (l.warehouseId !== warehouseId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'LOCATION_NOT_IN_WAREHOUSE',
      });
    }
  }
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

function tryTransition(from: number, to: number): void {
  try {
    validateTransition('Inbound', from, to);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith('ILLEGAL_TRANSITION')) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'ILLEGAL_TRANSITION' });
    }
    throw e;
  }
}

async function genInboundDocNo(db: Db, when: Date): Promise<string> {
  // Use a daily counter based on existing inbounds for the same date.
  const start = new Date(when);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const todayCount = await db.inbound.count({
    where: { createdAt: { gte: start, lt: end } },
  });
  // Try a few sequence numbers to handle concurrent races.
  for (let i = todayCount + 1; i < todayCount + 50; i++) {
    const candidate = genDocNo('RK', i, when);
    const dup = await db.inbound.findUnique({ where: { docNo: candidate } });
    if (!dup) return candidate;
  }
  throw new TRPCError({
    code: 'CONFLICT',
    message: 'CANNOT_ALLOCATE_DOC_NO',
  });
}

// ============================================================
// inboundService
//
// C-IM-03-003 reconciliation:
//   spec.json says "已审核单 void 应红冲 (Stock 回退 + StockLog 负数)".
//   operations.json's transitions only list 10→90 / 20→90 for void.
//   The integration test (inbound.test.ts "void after audit") explicitly
//   calls `void({ id })` on an audited inbound and expects red-rebound.
//   We therefore EXTEND the void semantics in this service:
//     - void from 10 or 20 → 90  : pure status flip, no stock side-effect
//     - void from 30           → 90  : red-rebound (subtract qty + log
//                                       a negative qty_change per line),
//                                       implemented inside this service
//   We do NOT route 30→90 through the generic state machine; the
//   state machine still rejects illegal transitions for any state we
//   don't explicitly handle here (e.g. void after finish/40).
// ============================================================

export const inboundService = {
  async create(
    ctx: AppContext,
    input: {
      kind: string;
      sourceDocNo?: string;
      warehouseId: bigint;
      operatorId: bigint;
      operationAt: Date;
      remark?: string;
      lines: Array<{
        goodsId: bigint;
        locationId: bigint;
        batchNo?: string;
        qty: string;
        unitPrice?: string;
        expireAt?: Date;
      }>;
    },
  ) {
    // Validate warehouse
    const wh = await warehouseRepo.findById(ctx.prisma, input.warehouseId);
    if (!wh) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'WAREHOUSE_NOT_FOUND' });
    }

    // Validate lines
    for (const l of input.lines) {
      ensureLineQty(l.qty);
    }
    await ensureLocationsBelongTo(
      ctx.prisma,
      input.warehouseId,
      input.lines.map((l) => l.locationId),
    );
    await ensureGoodsExist(
      ctx.prisma,
      input.lines.map((l) => l.goodsId),
    );

    const created = await ctx.prisma.$transaction(async (tx) => {
      const docNo = await genInboundDocNo(tx as unknown as Db, input.operationAt);
      return inboundRepo.create(tx, {
        header: {
          docNo,
          kind: input.kind,
          sourceDocNo: input.sourceDocNo ?? null,
          warehouseId: input.warehouseId,
          operatorId: input.operatorId,
          operationAt: input.operationAt,
          remark: input.remark ?? null,
          status: STATUS_DRAFT,
        },
        lines: input.lines.map((l) => ({
          goodsId: l.goodsId,
          locationId: l.locationId,
          batchNo: l.batchNo,
          qty: l.qty,
          unitPrice: l.unitPrice ?? null,
          expireAt: l.expireAt ?? null,
        })),
      });
    });
    await auditService.log(ctx, {
      entity: 'Inbound', entityId: created.id, actionType: 'CREATE',
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
      sourceDocNo?: string;
      warehouseId?: bigint;
      operatorId?: bigint;
      operationAt?: Date;
      remark?: string;
    },
  ) {
    const before = await inboundRepo.findById(ctx.prisma, input.id);
    if (!before) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'INBOUND_NOT_FOUND' });
    }
    if (before.status !== STATUS_DRAFT) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'IMMUTABLE_AFTER_AUDIT',
      });
    }
    if (input.warehouseId !== undefined) {
      const wh = await warehouseRepo.findById(ctx.prisma, input.warehouseId);
      if (!wh) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'WAREHOUSE_NOT_FOUND',
        });
      }
    }
    const data: Prisma.InboundUncheckedUpdateInput = {
      kind: input.kind ?? undefined,
      sourceDocNo: input.sourceDocNo ?? undefined,
      warehouseId: input.warehouseId ?? undefined,
      operatorId: input.operatorId ?? undefined,
      operationAt: input.operationAt ?? undefined,
      remark: input.remark ?? undefined,
    };
    const count = await inboundRepo.updateOptimistic(
      ctx.prisma,
      input.id,
      input.version,
      data as Prisma.InboundUpdateInput,
    );
    if (count === 0) {
      throw new TRPCError({ code: 'CONFLICT', message: '版本冲突或记录不存在' });
    }
    const after = await inboundRepo.findById(ctx.prisma, input.id);
    await auditService.log(ctx, {
      entity: 'Inbound', entityId: input.id, actionType: 'UPDATE', before, after,
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
      warehouseId?: bigint;
      status?: number;
      from?: Date;
      to?: Date;
      sortField?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    return inboundRepo.findPage(ctx.prisma, input);
  },

  async detail(ctx: AppContext, id: bigint) {
    const r = await inboundRepo.findByIdWithLines(ctx.prisma, id);
    if (!r) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'INBOUND_NOT_FOUND' });
    }
    return publicView(r);
  },

  async listLines(ctx: AppContext, inboundId: bigint) {
    const r = await inboundRepo.findById(ctx.prisma, inboundId);
    if (!r) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'INBOUND_NOT_FOUND' });
    }
    return inboundRepo.findLines(ctx.prisma, inboundId);
  },

  async addLine(
    ctx: AppContext,
    input: {
      inboundId: bigint;
      goodsId: bigint;
      locationId: bigint;
      batchNo?: string;
      qty: string;
      unitPrice?: string;
      expireAt?: Date;
    },
  ) {
    const head = await inboundRepo.findById(ctx.prisma, input.inboundId);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'INBOUND_NOT_FOUND' });
    }
    if (head.status !== STATUS_DRAFT) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'IMMUTABLE_AFTER_AUDIT',
      });
    }
    ensureLineQty(input.qty);
    await ensureLocationsBelongTo(ctx.prisma, head.warehouseId, [input.locationId]);
    await ensureGoodsExist(ctx.prisma, [input.goodsId]);

    const line = await inboundRepo.addLine(ctx.prisma, input.inboundId, {
      goodsId: input.goodsId,
      locationId: input.locationId,
      batchNo: input.batchNo,
      qty: input.qty,
      unitPrice: input.unitPrice ?? null,
      expireAt: input.expireAt ?? null,
    });
    await auditService.log(ctx, {
      entity: 'InboundLine', entityId: line.id, actionType: 'CREATE', after: line,
    });
    return publicView(line);
  },

  async updateLine(
    ctx: AppContext,
    input: {
      id: bigint;
      goodsId?: bigint;
      locationId?: bigint;
      batchNo?: string;
      qty?: string;
      unitPrice?: string;
      expireAt?: Date;
    },
  ) {
    const before = await inboundRepo.findLineById(ctx.prisma, input.id);
    if (!before) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'LINE_NOT_FOUND' });
    }
    const head = await inboundRepo.findById(ctx.prisma, before.inboundId);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'INBOUND_NOT_FOUND' });
    }
    if (head.status !== STATUS_DRAFT) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'IMMUTABLE_AFTER_AUDIT',
      });
    }
    if (input.qty !== undefined) ensureLineQty(input.qty);
    if (input.locationId !== undefined) {
      await ensureLocationsBelongTo(ctx.prisma, head.warehouseId, [input.locationId]);
    }
    if (input.goodsId !== undefined) {
      await ensureGoodsExist(ctx.prisma, [input.goodsId]);
    }
    const data: Prisma.InboundLineUncheckedUpdateInput = {
      goodsId: input.goodsId ?? undefined,
      locationId: input.locationId ?? undefined,
      batchNo: input.batchNo ?? undefined,
      qty: input.qty ?? undefined,
      unitPrice: input.unitPrice ?? undefined,
      expireAt: input.expireAt ?? undefined,
    };
    const updated = await inboundRepo.updateLine(
      ctx.prisma,
      input.id,
      data as Prisma.InboundLineUpdateInput,
    );
    await auditService.log(ctx, {
      entity: 'InboundLine', entityId: input.id, actionType: 'UPDATE',
      before, after: updated,
    });
    return publicView(updated);
  },

  async removeLine(ctx: AppContext, id: bigint) {
    const line = await inboundRepo.findLineById(ctx.prisma, id);
    if (!line) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'LINE_NOT_FOUND' });
    }
    const head = await inboundRepo.findById(ctx.prisma, line.inboundId);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'INBOUND_NOT_FOUND' });
    }
    if (head.status !== STATUS_DRAFT) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'IMMUTABLE_AFTER_AUDIT',
      });
    }
    await inboundRepo.removeLine(ctx.prisma, id);
    await auditService.log(ctx, {
      entity: 'InboundLine', entityId: id, actionType: 'DELETE', before: line,
    });
    return { ok: true as const };
  },

  async delete(ctx: AppContext, id: bigint) {
    const head = await inboundRepo.findById(ctx.prisma, id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'INBOUND_NOT_FOUND' });
    }
    if (head.status !== STATUS_DRAFT && head.status !== STATUS_VOID) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'CANNOT_DELETE_NON_DRAFT',
      });
    }
    await inboundRepo.delete(ctx.prisma, id);
    await auditService.log(ctx, {
      entity: 'Inbound', entityId: id, actionType: 'DELETE', before: head,
    });
    return { ok: true as const };
  },

  /**
   * Generic transition router. The state machine validates the move;
   * each leg also dispatches to the corresponding side-effect method.
   */
  async transition(
    ctx: AppContext,
    input: { id: bigint; from: number; to: number; reason?: string },
  ) {
    const head = await inboundRepo.findById(ctx.prisma, input.id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'INBOUND_NOT_FOUND' });
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
    if (input.from === STATUS_AUDITED && input.to === STATUS_FINISHED) {
      return this.finish(ctx, input.id);
    }
    if (input.to === STATUS_VOID) {
      return this.void(ctx, input.id);
    }
    tryTransition(input.from, input.to);
    // Fallback (shouldn't reach since state machine catches everything else):
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'ILLEGAL_TRANSITION' });
  },

  async submit(ctx: AppContext, id: bigint) {
    const head = await inboundRepo.findById(ctx.prisma, id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'INBOUND_NOT_FOUND' });
    }
    tryTransition(head.status, STATUS_SUBMITTED);
    const updated = await inboundRepo.setStatus(
      ctx.prisma,
      id,
      STATUS_SUBMITTED,
      ctx.user?.id ?? head.operatorId,
    );
    await auditService.log(ctx, {
      entity: 'Inbound', entityId: id, actionType: 'SUBMIT',
      before: { status: head.status }, after: { status: STATUS_SUBMITTED },
    });
    return publicView(updated);
  },

  async audit(ctx: AppContext, id: bigint) {
    const head = await inboundRepo.findByIdWithLines(ctx.prisma, id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'INBOUND_NOT_FOUND' });
    }
    tryTransition(head.status, STATUS_AUDITED);
    const operatorId = ctx.user?.id ?? head.operatorId;
    const updated = await ctx.prisma.$transaction(async (tx) => {
      // Apply stock effects for each line.
      for (const line of head.lines) {
        await stockService.applyInboundEffect(tx as unknown as Db, {
          warehouseId: head.warehouseId,
          locationId: line.locationId,
          goodsId: line.goodsId,
          batchNo: line.batchNo,
          qty: line.qty,
          refDocNo: head.docNo,
          operatorId,
        });
      }
      return inboundRepo.setStatus(tx, id, STATUS_AUDITED, operatorId);
    });
    await auditService.log(ctx, {
      entity: 'Inbound', entityId: id, actionType: 'AUDIT',
      before: { status: head.status }, after: { status: STATUS_AUDITED },
    });
    return publicView(updated);
  },

  async finish(ctx: AppContext, id: bigint) {
    const head = await inboundRepo.findById(ctx.prisma, id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'INBOUND_NOT_FOUND' });
    }
    tryTransition(head.status, STATUS_FINISHED);
    const updated = await inboundRepo.setStatus(
      ctx.prisma,
      id,
      STATUS_FINISHED,
      ctx.user?.id ?? head.operatorId,
    );
    await auditService.log(ctx, {
      entity: 'Inbound', entityId: id, actionType: 'FINISH',
      before: { status: head.status }, after: { status: STATUS_FINISHED },
    });
    return publicView(updated);
  },

  /**
   * Void an inbound.
   *   - 10 → 90  : simple status flip
   *   - 20 → 90  : simple status flip
   *   - 30 → 90  : red-rebound — subtract each line's qty from the
   *                corresponding stock slot and append a negative-qty
   *                StockLog entry per line. (See class-level comment for
   *                the C-IM-03-003 reconciliation note.)
   *   - any other state : ILLEGAL_TRANSITION (BAD_REQUEST)
   */
  async void(ctx: AppContext, id: bigint) {
    const head = await inboundRepo.findByIdWithLines(ctx.prisma, id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'INBOUND_NOT_FOUND' });
    }

    const fromState = head.status;
    if (
      fromState !== STATUS_DRAFT &&
      fromState !== STATUS_SUBMITTED &&
      fromState !== STATUS_AUDITED
    ) {
      // 40 (finished) and 90 (already void) cannot be voided.
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'ILLEGAL_TRANSITION' });
    }

    const operatorId = ctx.user?.id ?? head.operatorId;

    if (fromState === STATUS_AUDITED) {
      // Red-rebound path
      const updated = await ctx.prisma.$transaction(async (tx) => {
        for (const line of head.lines) {
          await stockService.redReverseInboundByKey(tx as unknown as Db, {
            warehouseId: head.warehouseId,
            locationId: line.locationId,
            goodsId: line.goodsId,
            batchNo: line.batchNo,
            qty: line.qty,
            refDocNo: head.docNo,
            operatorId,
          });
        }
        return inboundRepo.setStatus(tx, id, STATUS_VOID, operatorId);
      });
      await auditService.log(ctx, {
        entity: 'Inbound', entityId: id, actionType: 'VOID_RED_REVERSE',
        before: { status: fromState }, after: { status: STATUS_VOID },
      });
      return publicView(updated);
    }

    // 10/20 → 90 simple flip
    tryTransition(fromState, STATUS_VOID);
    const updated = await inboundRepo.setStatus(
      ctx.prisma,
      id,
      STATUS_VOID,
      operatorId,
    );
    await auditService.log(ctx, {
      entity: 'Inbound', entityId: id, actionType: 'VOID',
      before: { status: fromState }, after: { status: STATUS_VOID },
    });
    return publicView(updated);
  },

  /**
   * Explicit alias for the red-rebound path.  Required when the caller
   * wants to be unambiguous: only valid from status=30, will perform the
   * stock rollback and flip to 90.  See void() for the umbrella behavior
   * mandated by the integration test.
   */
  async redReverse(ctx: AppContext, id: bigint) {
    const head = await inboundRepo.findById(ctx.prisma, id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'INBOUND_NOT_FOUND' });
    }
    if (head.status !== STATUS_AUDITED) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'ILLEGAL_TRANSITION' });
    }
    return this.void(ctx, id);
  },
};
