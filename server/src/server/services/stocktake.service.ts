import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import type { AppContext } from '../context';
import type { Db } from '../repositories/_base';
import { stocktakeRepo } from '../repositories/stocktake.repo';
import { warehouseRepo } from '../repositories/warehouse.repo';
import { auditService } from './audit.service';
import { validateTransition } from './stateMachine.service';
import { genDocNo } from './docNo.service';
import { computeDifference, classifyDifference } from './stocktake.math';
import { inboundService } from './inbound.service';
import { outboundService } from './outbound.service';

// ============================================================
// State constants for Stocktake
//   10 = draft, 20 = frozen, 25 = submitted (差异已确认),
//   30 = committed (盘盈/盘亏单已审核入账), 40 = finished, 90 = cancelled
// ============================================================
const STATUS_DRAFT = 10;
const STATUS_FROZEN = 20;
const STATUS_SUBMITTED = 25;
const STATUS_COMMITTED = 30;
const STATUS_FINISHED = 40;
const STATUS_CANCELLED = 90;

// ============================================================
// Helpers
// ============================================================

function publicView<T>(row: T): T {
  return row;
}

function tryTransition(from: number, to: number): void {
  try {
    validateTransition('Stocktake', from, to);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith('ILLEGAL_TRANSITION')) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'ILLEGAL_TRANSITION' });
    }
    throw e;
  }
}

/**
 * Generate a unique stocktake document number using the 'PD' prefix (盘点).
 * Mirrors the inbound/outbound implementations: a daily counter scoped to
 * the operationAt date, with retry to handle concurrent collisions.
 */
async function genStocktakeDocNo(db: Db, when: Date): Promise<string> {
  const start = new Date(when);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const todayCount = await db.stocktake.count({
    where: { createdAt: { gte: start, lt: end } },
  });
  for (let i = todayCount + 1; i < todayCount + 50; i++) {
    const candidate = genDocNo('PD', i, when);
    const dup = await db.stocktake.findUnique({ where: { docNo: candidate } });
    if (!dup) return candidate;
  }
  throw new TRPCError({
    code: 'CONFLICT',
    message: 'CANNOT_ALLOCATE_DOC_NO',
  });
}

/**
 * Negate a decimal string (treats absent leading sign as positive).  Used
 * when converting a negative `difference` into a positive ship qty for the
 * auto-generated 盘亏 outbound.
 */
function absDecimal(s: string): string {
  return s.startsWith('-') ? s.slice(1) : s;
}

/**
 * Robust JSON parse for the optional `locationIds` / `categoryIds` fields
 * on the Stocktake header.  Stored as JSON-stringified bigint-id arrays in
 * a TEXT column (string IDs to dodge BigInt JSON limitations).  We accept
 * either string or already-parsed array.
 */
function parseIdJson(raw: string | null | undefined): bigint[] | null {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    const arr = JSON.parse(raw) as Array<string | number>;
    if (!Array.isArray(arr)) return null;
    return arr.map((x) => BigInt(x));
  } catch {
    return null;
  }
}

// ============================================================
// stocktakeService
//
// Lifecycle:
//   create(10) → freeze(20, snapshot Stock to lines)
//             → updateLineActual* (set actualQty + auto-diff)
//             → submit(25, requires reason on every non-zero diff)
//             → commit(30, auto-create + audit gain Inbound and loss
//                      Outbound docs to materialize stock changes)
//             → finish(40)
//             \_ cancel(90) [from 10 / 20 only — once commit has run,
//                            cancel is illegal because stock is moved]
//
// Cross-cutting:
//   While status === 20 (frozen), inbound.audit and outbound.audit on
//   non-STOCKTAKE-kind docs are blocked via stocktakeRepo.countActive
//   ByWarehouseAndGoods → see inbound.service / outbound.service for the
//   STOCKTAKE_FROZEN guard with the kind=STOCKTAKE exception.
// ============================================================

export const stocktakeService = {
  // ----------------------------------------------------------------
  // CRUD
  // ----------------------------------------------------------------
  async create(
    ctx: AppContext,
    input: {
      kind: string;
      warehouseId: bigint;
      locationIds?: bigint[];
      categoryIds?: bigint[];
      operatorId: bigint;
      operationAt: Date;
      reason?: string;
      remark?: string;
    },
  ) {
    // Validate warehouse exists.
    const wh = await warehouseRepo.findById(ctx.prisma, input.warehouseId);
    if (!wh) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'WAREHOUSE_NOT_FOUND',
      });
    }

    const created = await ctx.prisma.$transaction(async (tx) => {
      const docNo = await genStocktakeDocNo(tx as unknown as Db, input.operationAt);
      return stocktakeRepo.create(tx, {
        header: {
          docNo,
          kind: input.kind,
          warehouseId: input.warehouseId,
          locationIds:
            input.locationIds && input.locationIds.length > 0
              ? JSON.stringify(input.locationIds.map((x) => x.toString()))
              : null,
          categoryIds:
            input.categoryIds && input.categoryIds.length > 0
              ? JSON.stringify(input.categoryIds.map((x) => x.toString()))
              : null,
          operatorId: input.operatorId,
          operationAt: input.operationAt,
          reason: input.reason ?? null,
          remark: input.remark ?? null,
          status: STATUS_DRAFT,
        },
        lines: [],
      });
    });
    await auditService.log(ctx, {
      entity: 'Stocktake',
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
      warehouseId?: bigint;
      locationIds?: bigint[];
      categoryIds?: bigint[];
      operatorId?: bigint;
      operationAt?: Date;
      reason?: string;
      remark?: string;
    },
  ) {
    const before = await stocktakeRepo.findById(ctx.prisma, input.id);
    if (!before) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'STOCKTAKE_NOT_FOUND' });
    }
    if (before.status !== STATUS_DRAFT) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'IMMUTABLE_AFTER_FREEZE',
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
    const data: Prisma.StocktakeUncheckedUpdateInput = {
      kind: input.kind ?? undefined,
      warehouseId: input.warehouseId ?? undefined,
      locationIds:
        input.locationIds !== undefined
          ? input.locationIds.length === 0
            ? null
            : JSON.stringify(input.locationIds.map((x) => x.toString()))
          : undefined,
      categoryIds:
        input.categoryIds !== undefined
          ? input.categoryIds.length === 0
            ? null
            : JSON.stringify(input.categoryIds.map((x) => x.toString()))
          : undefined,
      operatorId: input.operatorId ?? undefined,
      operationAt: input.operationAt ?? undefined,
      reason: input.reason ?? undefined,
      remark: input.remark ?? undefined,
    };
    const count = await stocktakeRepo.updateOptimistic(
      ctx.prisma,
      input.id,
      input.version,
      data as Prisma.StocktakeUpdateInput,
    );
    if (count === 0) {
      throw new TRPCError({ code: 'CONFLICT', message: '版本冲突或记录不存在' });
    }
    const after = await stocktakeRepo.findById(ctx.prisma, input.id);
    await auditService.log(ctx, {
      entity: 'Stocktake',
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
      warehouseId?: bigint;
      status?: number;
      from?: Date;
      to?: Date;
      sortField?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    return stocktakeRepo.findPage(ctx.prisma, input);
  },

  async detail(ctx: AppContext, id: bigint) {
    const r = await stocktakeRepo.findByIdWithLines(ctx.prisma, id);
    if (!r) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'STOCKTAKE_NOT_FOUND' });
    }
    return publicView(r);
  },

  async listLines(ctx: AppContext, stocktakeId: bigint) {
    const r = await stocktakeRepo.findById(ctx.prisma, stocktakeId);
    if (!r) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'STOCKTAKE_NOT_FOUND' });
    }
    return stocktakeRepo.findLines(ctx.prisma, stocktakeId);
  },

  // ----------------------------------------------------------------
  // Line CRUD (status=10 only — manual SAMPLING/DYNAMIC entry)
  // ----------------------------------------------------------------
  async addLine(
    ctx: AppContext,
    input: {
      stocktakeId: bigint;
      goodsId: bigint;
      locationId: bigint;
      batchNo?: string;
      bookQty: string;
      actualQty?: string;
      reason?: string;
    },
  ) {
    const head = await stocktakeRepo.findById(ctx.prisma, input.stocktakeId);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'STOCKTAKE_NOT_FOUND' });
    }
    if (head.status !== STATUS_DRAFT) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'IMMUTABLE_AFTER_FREEZE',
      });
    }
    // If actualQty is provided up-front, auto-compute the difference.
    const difference =
      input.actualQty !== undefined
        ? computeDifference(input.bookQty, input.actualQty)
        : null;
    const line = await stocktakeRepo.addLine(ctx.prisma, input.stocktakeId, {
      goodsId: input.goodsId,
      locationId: input.locationId,
      batchNo: input.batchNo,
      bookQty: input.bookQty,
      actualQty: input.actualQty ?? null,
      difference,
      reason: input.reason ?? null,
    });
    await auditService.log(ctx, {
      entity: 'StocktakeLine',
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
      locationId?: bigint;
      batchNo?: string;
      bookQty?: string;
      actualQty?: string;
      reason?: string;
    },
  ) {
    const before = await stocktakeRepo.findLineById(ctx.prisma, input.id);
    if (!before) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'LINE_NOT_FOUND' });
    }
    const head = await stocktakeRepo.findById(ctx.prisma, before.stocktakeId);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'STOCKTAKE_NOT_FOUND' });
    }
    if (head.status !== STATUS_DRAFT) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'IMMUTABLE_AFTER_FREEZE',
      });
    }
    // Recompute difference if either bookQty or actualQty changes.
    const newBook = input.bookQty ?? before.bookQty;
    const newActual = input.actualQty ?? before.actualQty;
    const newDiff =
      newActual !== null && newActual !== undefined
        ? computeDifference(newBook, newActual)
        : null;
    const data: Prisma.StocktakeLineUncheckedUpdateInput = {
      goodsId: input.goodsId ?? undefined,
      locationId: input.locationId ?? undefined,
      batchNo: input.batchNo ?? undefined,
      bookQty: input.bookQty ?? undefined,
      actualQty: input.actualQty ?? undefined,
      difference: newDiff,
      reason: input.reason ?? undefined,
    };
    const updated = await stocktakeRepo.updateLine(
      ctx.prisma,
      input.id,
      data as Prisma.StocktakeLineUpdateInput,
    );
    await auditService.log(ctx, {
      entity: 'StocktakeLine',
      entityId: input.id,
      actionType: 'UPDATE',
      before,
      after: updated,
    });
    return publicView(updated);
  },

  async removeLine(ctx: AppContext, id: bigint) {
    const line = await stocktakeRepo.findLineById(ctx.prisma, id);
    if (!line) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'LINE_NOT_FOUND' });
    }
    const head = await stocktakeRepo.findById(ctx.prisma, line.stocktakeId);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'STOCKTAKE_NOT_FOUND' });
    }
    if (head.status !== STATUS_DRAFT) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'IMMUTABLE_AFTER_FREEZE',
      });
    }
    await stocktakeRepo.removeLine(ctx.prisma, id);
    await auditService.log(ctx, {
      entity: 'StocktakeLine',
      entityId: id,
      actionType: 'DELETE',
      before: line,
    });
    return { ok: true as const };
  },

  /**
   * Set actualQty on a frozen line (status=20) and auto-compute the
   * difference (= actualQty - bookQty).  Optionally records the reason.
   */
  async updateLineActual(
    ctx: AppContext,
    input: { id: bigint; actualQty: string; reason?: string },
  ) {
    const before = await stocktakeRepo.findLineById(ctx.prisma, input.id);
    if (!before) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'LINE_NOT_FOUND' });
    }
    const head = await stocktakeRepo.findById(ctx.prisma, before.stocktakeId);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'STOCKTAKE_NOT_FOUND' });
    }
    if (head.status !== STATUS_FROZEN) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'CAN_ONLY_FILL_ACTUAL_WHEN_FROZEN',
      });
    }
    const difference = computeDifference(before.bookQty, input.actualQty);
    const data: Prisma.StocktakeLineUncheckedUpdateInput = {
      actualQty: input.actualQty,
      difference,
      reason: input.reason ?? undefined,
    };
    const updated = await stocktakeRepo.updateLine(
      ctx.prisma,
      input.id,
      data as Prisma.StocktakeLineUpdateInput,
    );
    await auditService.log(ctx, {
      entity: 'StocktakeLine',
      entityId: input.id,
      actionType: 'UPDATE_ACTUAL',
      before,
      after: updated,
    });
    return publicView(updated);
  },

  async delete(ctx: AppContext, id: bigint) {
    const head = await stocktakeRepo.findById(ctx.prisma, id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'STOCKTAKE_NOT_FOUND' });
    }
    if (head.status !== STATUS_DRAFT && head.status !== STATUS_CANCELLED) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'CANNOT_DELETE_NON_DRAFT',
      });
    }
    await stocktakeRepo.delete(ctx.prisma, id);
    await auditService.log(ctx, {
      entity: 'Stocktake',
      entityId: id,
      actionType: 'DELETE',
      before: head,
    });
    return { ok: true as const };
  },

  // ----------------------------------------------------------------
  // State machine
  // ----------------------------------------------------------------

  /**
   * Generic transition router.  Validates the move via the state machine
   * and dispatches to the corresponding side-effect method.
   */
  async transition(
    ctx: AppContext,
    input: { id: bigint; from: number; to: number; reason?: string },
  ) {
    const head = await stocktakeRepo.findById(ctx.prisma, input.id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'STOCKTAKE_NOT_FOUND' });
    }
    if (head.status !== input.from) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'STATE_MISMATCH' });
    }
    if (input.from === STATUS_DRAFT && input.to === STATUS_FROZEN) {
      return this.freeze(ctx, input.id);
    }
    if (input.from === STATUS_FROZEN && input.to === STATUS_SUBMITTED) {
      return this.submit(ctx, input.id);
    }
    if (input.from === STATUS_SUBMITTED && input.to === STATUS_COMMITTED) {
      return this.commit(ctx, input.id);
    }
    if (input.from === STATUS_COMMITTED && input.to === STATUS_FINISHED) {
      return this.finish(ctx, input.id);
    }
    if (input.to === STATUS_CANCELLED) {
      return this.cancel(ctx, input.id);
    }
    tryTransition(input.from, input.to);
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'ILLEGAL_TRANSITION' });
  },

  /**
   * 10 → 20: freeze.  Snapshot every Stock row in the stocktake's scope
   * (warehouse + optional location/category filters from the header) into
   * StocktakeLine rows.  For FULL kind we capture all stock; for SAMPLING /
   * DYNAMIC the user has typically pre-added lines via addLine() and we
   * leave those untouched (no snapshot inserted to avoid duplicates).
   */
  async freeze(ctx: AppContext, id: bigint) {
    const head = await stocktakeRepo.findByIdWithLines(ctx.prisma, id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'STOCKTAKE_NOT_FOUND' });
    }
    tryTransition(head.status, STATUS_FROZEN);
    const operatorId = ctx.user?.id ?? head.operatorId;

    const updated = await ctx.prisma.$transaction(async (tx) => {
      // Determine which existing (location, goods, batch) combinations are
      // already present (for SAMPLING / DYNAMIC) so we don't snapshot a
      // duplicate over a manual entry.
      const existingKeys = new Set<string>();
      for (const l of head.lines) {
        existingKeys.add(
          `${l.locationId.toString()}|${l.goodsId.toString()}|${l.batchNo}`,
        );
      }

      // Build the optional scope filter from the header's locationIds /
      // categoryIds JSON columns.
      const locFilter = parseIdJson(head.locationIds);
      const catFilter = parseIdJson(head.categoryIds);

      const stocks = await (tx as unknown as Db).stock.findMany({
        where: {
          warehouseId: head.warehouseId,
          ...(locFilter ? { locationId: { in: locFilter } } : {}),
          ...(catFilter ? { goods: { categoryId: { in: catFilter } } } : {}),
        },
        orderBy: { id: 'asc' },
      });

      const toInsert: Array<{
        goodsId: bigint;
        locationId: bigint;
        batchNo: string;
        bookQty: string;
        actualQty: null;
        difference: null;
        reason: null;
      }> = [];
      for (const s of stocks) {
        const k = `${s.locationId.toString()}|${s.goodsId.toString()}|${s.batchNo}`;
        if (existingKeys.has(k)) continue;
        toInsert.push({
          goodsId: s.goodsId,
          locationId: s.locationId,
          batchNo: s.batchNo,
          bookQty: s.qtyOnHand,
          actualQty: null,
          difference: null,
          reason: null,
        });
      }
      if (toInsert.length > 0) {
        await stocktakeRepo.bulkInsertLines(tx as unknown as Db, id, toInsert);
      }
      return stocktakeRepo.setStatus(tx, id, STATUS_FROZEN, operatorId);
    });

    await auditService.log(ctx, {
      entity: 'Stocktake',
      entityId: id,
      actionType: 'FREEZE',
      before: { status: head.status },
      after: { status: STATUS_FROZEN },
    });
    return publicView(updated);
  },

  /**
   * 20 → 25: submit.  Validate that every line whose difference is
   * non-zero has a non-empty reason — otherwise throw BAD_REQUEST
   * MISSING_DIFFERENCE_REASON.
   */
  async submit(ctx: AppContext, id: bigint) {
    const head = await stocktakeRepo.findByIdWithLines(ctx.prisma, id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'STOCKTAKE_NOT_FOUND' });
    }
    tryTransition(head.status, STATUS_SUBMITTED);

    for (const line of head.lines) {
      const diff = line.difference;
      if (diff === null || diff === undefined) {
        // No difference computed yet → actualQty was never set.  The
        // workflow expects every frozen line to be filled in before
        // submit; treat as a missing reason equivalent.
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'MISSING_DIFFERENCE_REASON',
        });
      }
      if (
        classifyDifference(diff) !== 'NONE' &&
        (line.reason === null || line.reason === undefined || line.reason === '')
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'MISSING_DIFFERENCE_REASON',
        });
      }
    }

    const operatorId = ctx.user?.id ?? head.operatorId;
    const updated = await stocktakeRepo.setStatus(
      ctx.prisma,
      id,
      STATUS_SUBMITTED,
      operatorId,
    );
    await auditService.log(ctx, {
      entity: 'Stocktake',
      entityId: id,
      actionType: 'SUBMIT',
      before: { status: head.status },
      after: { status: STATUS_SUBMITTED },
    });
    return publicView(updated);
  },

  /**
   * 25 → 30: commit.  The "magic" step that materializes the count
   * difference into real stock changes by auto-creating two side docs:
   *
   *   - 盘盈 (gain) Inbound  : kind=STOCKTAKE, with one line per positive-diff
   *                            stocktake line (qty = +difference).  We then
   *                            submit + audit it so stockOnHand goes up.
   *   - 盘亏 (loss) Outbound : kind=STOCKTAKE, pickStrategy=MANUAL, with one
   *                            line per negative-diff stocktake line (qty =
   *                            |difference|).  We then submit + audit + ship
   *                            it so stockOnHand goes down.
   *
   * The auto-generated docNos are persisted back onto the stocktake header
   * (gainDocNo / lossDocNo).
   *
   * Both auto-docs are exempt from the STOCKTAKE_FROZEN guard via the
   * kind=STOCKTAKE check in inbound.audit / outbound.audit (otherwise the
   * freeze we are committing would block its own resolution).
   */
  async commit(ctx: AppContext, id: bigint) {
    const head = await stocktakeRepo.findByIdWithLines(ctx.prisma, id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'STOCKTAKE_NOT_FOUND' });
    }
    tryTransition(head.status, STATUS_COMMITTED);
    const operatorId = ctx.user?.id ?? head.operatorId;
    const now = ctx.clock?.now() ?? new Date();

    // Partition lines by sign of difference.
    const gainLines: typeof head.lines = [];
    const lossLines: typeof head.lines = [];
    for (const l of head.lines) {
      const cls = classifyDifference(l.difference ?? '0');
      if (cls === 'GAIN') gainLines.push(l);
      else if (cls === 'LOSS') lossLines.push(l);
    }

    let gainDocNo: string | null = null;
    let lossDocNo: string | null = null;

    // --- 盘盈 Inbound ---
    if (gainLines.length > 0) {
      const created = await inboundService.create(ctx, {
        kind: 'STOCKTAKE',
        warehouseId: head.warehouseId,
        operatorId,
        operationAt: now,
        remark: `Stocktake gain ${head.docNo}`,
        lines: gainLines.map((l) => ({
          goodsId: l.goodsId,
          locationId: l.locationId,
          batchNo: l.batchNo,
          // difference is positive for gains; pass through as-is.
          qty: l.difference ?? '0',
        })),
      });
      await inboundService.submit(ctx, created.id);
      await inboundService.audit(ctx, created.id);
      gainDocNo = created.docNo;
    }

    // --- 盘亏 Outbound ---
    if (lossLines.length > 0) {
      const created = await outboundService.create(ctx, {
        kind: 'STOCKTAKE',
        warehouseId: head.warehouseId,
        operatorId,
        operationAt: now,
        pickStrategy: 'MANUAL',
        remark: `Stocktake loss ${head.docNo}`,
        lines: lossLines.map((l) => ({
          goodsId: l.goodsId,
          locationId: l.locationId,
          batchNo: l.batchNo,
          // difference is negative; ship qty must be the absolute value.
          qty: absDecimal(l.difference ?? '0'),
        })),
      });
      await outboundService.submit(ctx, created.id);
      await outboundService.audit(ctx, created.id);
      await outboundService.ship(ctx, created.id);
      lossDocNo = created.docNo;
    }

    // Persist gain/loss doc nos and flip status to 30.
    const updated = await ctx.prisma.$transaction(async (tx) => {
      if (gainDocNo !== null || lossDocNo !== null) {
        await stocktakeRepo.updateGainLossDocNos(tx as unknown as Db, id, {
          gainDocNo: gainDocNo ?? undefined,
          lossDocNo: lossDocNo ?? undefined,
        });
      }
      return stocktakeRepo.setStatus(tx, id, STATUS_COMMITTED, operatorId);
    });

    await auditService.log(ctx, {
      entity: 'Stocktake',
      entityId: id,
      actionType: 'COMMIT',
      before: { status: head.status },
      after: {
        status: STATUS_COMMITTED,
        gainDocNo,
        lossDocNo,
      },
    });
    return publicView(updated);
  },

  /**
   * 30 → 40: finish.  Pure status flip + audit log.
   */
  async finish(ctx: AppContext, id: bigint) {
    const head = await stocktakeRepo.findById(ctx.prisma, id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'STOCKTAKE_NOT_FOUND' });
    }
    tryTransition(head.status, STATUS_FINISHED);
    const operatorId = ctx.user?.id ?? head.operatorId;
    const updated = await stocktakeRepo.setStatus(
      ctx.prisma,
      id,
      STATUS_FINISHED,
      operatorId,
    );
    await auditService.log(ctx, {
      entity: 'Stocktake',
      entityId: id,
      actionType: 'FINISH',
      before: { status: head.status },
      after: { status: STATUS_FINISHED },
    });
    return publicView(updated);
  },

  /**
   * Cancel:
   *   - 10 / 20 → 90 : pure status flip.  When cancelling from frozen,
   *                    the freeze is implicitly released (no stock side
   *                    effect needed because freeze never moved stock).
   *   - any other state : ILLEGAL_TRANSITION.
   */
  async cancel(ctx: AppContext, id: bigint) {
    const head = await stocktakeRepo.findById(ctx.prisma, id);
    if (!head) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'STOCKTAKE_NOT_FOUND' });
    }
    const fromState = head.status;
    if (fromState !== STATUS_DRAFT && fromState !== STATUS_FROZEN) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'ILLEGAL_TRANSITION',
      });
    }
    tryTransition(fromState, STATUS_CANCELLED);
    const operatorId = ctx.user?.id ?? head.operatorId;
    const updated = await stocktakeRepo.setStatus(
      ctx.prisma,
      id,
      STATUS_CANCELLED,
      operatorId,
    );
    await auditService.log(ctx, {
      entity: 'Stocktake',
      entityId: id,
      actionType: 'CANCEL',
      before: { status: fromState },
      after: { status: STATUS_CANCELLED },
    });
    return publicView(updated);
  },
};

