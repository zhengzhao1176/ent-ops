import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, getPrisma } from '../fixtures/db';
import {
  seedBaseRoles,
  seedRootDepartment,
  seedUser,
  seedCategory,
  seedUnit,
  seedGoods,
  seedWarehouse,
  seedLocation,
  seedStock,
} from '../fixtures/factories';
import { callerForUserId } from '../fixtures/caller';

interface StocktakeFixtures {
  callerUserId: bigint;
  warehouseId: bigint;
  locationId: bigint;
  goodsId: bigint;
  goodsId2: bigint;
}

async function adminCaller() {
  const { user } = await seedUser({
    employeeNo: 'E_ST',
    username: 'stadmin',
    mobile: '13900000500',
    email: 'st@a.com',
    status: 'ACTIVE',
    roleCodes: ['ROLE_SUPER_ADMIN'],
  });
  return { user, caller: await callerForUserId(user.id) };
}

async function setupStocktakeFixtures(): Promise<StocktakeFixtures> {
  const { user } = await adminCaller();
  const cat = await seedCategory({});
  const unit = await seedUnit({});
  const goods = await seedGoods({ categoryId: cat.id, unitId: unit.id });
  const goods2 = await seedGoods({ categoryId: cat.id, unitId: unit.id });
  const warehouse = await seedWarehouse({});
  const location = await seedLocation({ warehouseId: warehouse.id });
  return {
    callerUserId: user.id,
    warehouseId: warehouse.id,
    locationId: location.id,
    goodsId: goods.id,
    goodsId2: goods2.id,
  };
}

/**
 * Pre-seed Stock rows under a fixture warehouse so that freeze (10→20)
 * has something to snapshot.
 */
async function seedStockFor(
  fx: StocktakeFixtures,
  goodsId: bigint,
  qty: string,
  batchNo = '',
) {
  return seedStock({
    warehouseId: fx.warehouseId,
    locationId: fx.locationId,
    goodsId,
    batchNo,
    qtyOnHand: qty,
    qtyLocked: '0',
    qtyAvailable: qty,
    qtyInTransit: '0',
  });
}

async function makeDraftStocktake(
  fx: StocktakeFixtures,
  kind: 'FULL' | 'SAMPLING' | 'DYNAMIC' = 'FULL',
) {
  const c = await callerForUserId(fx.callerUserId);
  const stocktake = await c.stocktake.create({
    kind,
    warehouseId: fx.warehouseId,
    operatorId: fx.callerUserId,
    operationAt: new Date('2026-05-03T10:00:00Z'),
  });
  return { caller: c, stocktake };
}

type LineRow = { id: bigint; goodsId: bigint; bookQty: string };

// After freeze, set actualQty = bookQty for every line so submit/commit pass.
async function fillActualEqualsBook(
  caller: Awaited<ReturnType<typeof callerForUserId>>,
  stocktakeId: bigint,
) {
  const lines = await caller.stocktake.listLines({ stocktakeId });
  for (const l of lines as LineRow[]) {
    await caller.stocktake.updateLineActual({ id: l.id, actualQty: l.bookQty });
  }
}

describe('stocktake.* master-detail + state machine + side effects', () => {
  beforeEach(async () => {
    await resetDb();
    await seedBaseRoles();
    await seedRootDepartment();
  });

  // --------------------------------------------------------------
  // CRUD + master-detail (≥ 6 tests in this block)
  // --------------------------------------------------------------
  describe('create (draft)', () => {
    it('创建盘点草稿后状态=10 且未含明细 (kind=FULL)', async () => {
      const fx = await setupStocktakeFixtures();
      const { stocktake } = await makeDraftStocktake(fx, 'FULL');
      expect(stocktake.status).toBe(10);
      expect(stocktake.kind).toBe('FULL');
      expect(stocktake.warehouseId).toBe(fx.warehouseId);
      // contract: lines 由 freeze 时快照产生，create 时不接受 lines
      expect(stocktake.lines.length).toBe(0);
      expect(stocktake.docNo).toBeTruthy();
    });

    it('创建盘点单时 warehouseId 不存在应抛 BAD_REQUEST', async () => {
      const fx = await setupStocktakeFixtures();
      const c = await callerForUserId(fx.callerUserId);
      await expect(
        c.stocktake.create({
          kind: 'FULL',
          warehouseId: 9999999999n,
          operatorId: fx.callerUserId,
          operationAt: new Date('2026-05-03T10:00:00Z'),
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('创建 kind=SAMPLING 草稿后允许在 status=10 通过 addLine 手动追加明细', async () => {
      const fx = await setupStocktakeFixtures();
      await seedStockFor(fx, fx.goodsId, '100');
      const { caller, stocktake } = await makeDraftStocktake(fx, 'SAMPLING');
      const line = await caller.stocktake.addLine({
        stocktakeId: stocktake.id,
        goodsId: fx.goodsId,
        locationId: fx.locationId,
        bookQty: '100',
      });
      expect(line.bookQty).toBe('100');
      const detail = await caller.stocktake.detail({ id: stocktake.id });
      expect(detail.lines.length).toBe(1);
    });

    it('已 freeze (status=20) 后修改 header 字段应抛 BAD_REQUEST (仅 status=10 可改)', async () => {
      const fx = await setupStocktakeFixtures();
      await seedStockFor(fx, fx.goodsId, '100');
      const { caller, stocktake } = await makeDraftStocktake(fx, 'FULL');
      const frozen = await caller.stocktake.freeze({ id: stocktake.id });
      expect(frozen.status).toBe(20);
      await expect(
        caller.stocktake.update({
          id: stocktake.id,
          version: frozen.version,
          remark: '改备注',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('已 freeze (status=20) 后 SAMPLING addLine / removeLine 应抛 BAD_REQUEST', async () => {
      const fx = await setupStocktakeFixtures();
      await seedStockFor(fx, fx.goodsId, '100');
      const { caller, stocktake } = await makeDraftStocktake(fx, 'SAMPLING');
      const line = await caller.stocktake.addLine({
        stocktakeId: stocktake.id,
        goodsId: fx.goodsId,
        locationId: fx.locationId,
        bookQty: '100',
      });
      await caller.stocktake.freeze({ id: stocktake.id });
      await expect(
        caller.stocktake.addLine({
          stocktakeId: stocktake.id,
          goodsId: fx.goodsId2,
          locationId: fx.locationId,
          bookQty: '50',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      await expect(
        caller.stocktake.removeLine({ id: line.id }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('删除盘点单仅在 status=10 草稿状态时允许；已 freeze 应抛 BAD_REQUEST', async () => {
      const fx = await setupStocktakeFixtures();
      await seedStockFor(fx, fx.goodsId, '100');
      // 草稿可以删
      const { caller, stocktake } = await makeDraftStocktake(fx, 'FULL');
      await caller.stocktake.delete({ id: stocktake.id });

      // 冻结后不可删
      const { caller: c2, stocktake: st2 } = await makeDraftStocktake(fx, 'FULL');
      await c2.stocktake.freeze({ id: st2.id });
      await expect(
        c2.stocktake.delete({ id: st2.id }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  // --------------------------------------------------------------
  // State machine transitions (≥ 5 tests; 8 here)
  // --------------------------------------------------------------
  describe('state machine transitions', () => {
    it('freeze 把草稿(10)→已冻结(20) 并自动快照范围内 SKU', async () => {
      const fx = await setupStocktakeFixtures();
      await seedStockFor(fx, fx.goodsId, '100');
      const { caller, stocktake } = await makeDraftStocktake(fx, 'FULL');
      const frozen = await caller.stocktake.freeze({ id: stocktake.id });
      expect(frozen.status).toBe(20);
    });

    it('submit 把已冻结(20)→已提交(25) (在所有 line 都已填 actualQty 后)', async () => {
      const fx = await setupStocktakeFixtures();
      await seedStockFor(fx, fx.goodsId, '100');
      const { caller, stocktake } = await makeDraftStocktake(fx, 'FULL');
      await caller.stocktake.freeze({ id: stocktake.id });
      await fillActualEqualsBook(caller, stocktake.id);
      const submitted = await caller.stocktake.submit({ id: stocktake.id });
      expect(submitted.status).toBe(25);
    });

    it('commit 把已提交(25)→已 commit(30) 自动生成 inbound/outbound', async () => {
      const fx = await setupStocktakeFixtures();
      await seedStockFor(fx, fx.goodsId, '100');
      const { caller, stocktake } = await makeDraftStocktake(fx, 'FULL');
      await caller.stocktake.freeze({ id: stocktake.id });
      await fillActualEqualsBook(caller, stocktake.id);
      await caller.stocktake.submit({ id: stocktake.id });
      const committed = await caller.stocktake.commit({ id: stocktake.id });
      expect(committed.status).toBe(30);
    });

    it('finish 把已 commit(30)→已完成(40)', async () => {
      const fx = await setupStocktakeFixtures();
      await seedStockFor(fx, fx.goodsId, '100');
      const { caller, stocktake } = await makeDraftStocktake(fx, 'FULL');
      await caller.stocktake.freeze({ id: stocktake.id });
      await fillActualEqualsBook(caller, stocktake.id);
      await caller.stocktake.submit({ id: stocktake.id });
      await caller.stocktake.commit({ id: stocktake.id });
      const finished = await caller.stocktake.finish({ id: stocktake.id });
      expect(finished.status).toBe(40);
    });

    it('cancel 把草稿(10)→作废(90)', async () => {
      const fx = await setupStocktakeFixtures();
      const { caller, stocktake } = await makeDraftStocktake(fx, 'FULL');
      const cancelled = await caller.stocktake.cancel({ id: stocktake.id });
      expect(cancelled.status).toBe(90);
    });

    it('cancel 把已冻结(20)→作废(90) 释放 freeze 但不入账', async () => {
      const fx = await setupStocktakeFixtures();
      await seedStockFor(fx, fx.goodsId, '100');
      const { caller, stocktake } = await makeDraftStocktake(fx, 'FULL');
      await caller.stocktake.freeze({ id: stocktake.id });
      const cancelled = await caller.stocktake.cancel({ id: stocktake.id });
      expect(cancelled.status).toBe(90);
    });

    it('草稿(10)→已提交(25) 跳级非法 (必须先 freeze)', async () => {
      const fx = await setupStocktakeFixtures();
      await seedStockFor(fx, fx.goodsId, '100');
      const { caller, stocktake } = await makeDraftStocktake(fx, 'FULL');
      await expect(
        caller.stocktake.submit({ id: stocktake.id }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('已提交(25)→已冻结(20) 反向回退非法', async () => {
      const fx = await setupStocktakeFixtures();
      await seedStockFor(fx, fx.goodsId, '100');
      const { caller, stocktake } = await makeDraftStocktake(fx, 'FULL');
      await caller.stocktake.freeze({ id: stocktake.id });
      await fillActualEqualsBook(caller, stocktake.id);
      await caller.stocktake.submit({ id: stocktake.id });
      // 25→10 用 transition 触发反向
      await expect(
        caller.stocktake.transition({
          id: stocktake.id,
          from: 25,
          to: 10,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  // --------------------------------------------------------------
  // F-IM-06-EXTRA business rules (7 cases)
  // --------------------------------------------------------------
  describe('F-IM-06-EXTRA business rules', () => {
    it('C-IM-06-001 freeze 自动快照范围内 SKU 的账面数到 line.bookQty', async () => {
      const fx = await setupStocktakeFixtures();
      await seedStockFor(fx, fx.goodsId, '100');
      await seedStockFor(fx, fx.goodsId2, '50');
      const { caller, stocktake } = await makeDraftStocktake(fx, 'FULL');
      const frozen = await caller.stocktake.freeze({ id: stocktake.id });
      expect(frozen.status).toBe(20);

      const persistedLines = await getPrisma().stocktakeLine.findMany({
        where: { stocktakeId: stocktake.id },
        orderBy: { id: 'asc' },
      });
      expect(persistedLines.length).toBe(2);
      // 找 G1 / G2 各自的快照
      const lineG1 = persistedLines.find((l) => l.goodsId === fx.goodsId);
      const lineG2 = persistedLines.find((l) => l.goodsId === fx.goodsId2);
      expect(lineG1).toBeTruthy();
      expect(lineG2).toBeTruthy();
      expect(lineG1!.bookQty).toBe('100');
      expect(lineG2!.bookQty).toBe('50');
      // 每条 (warehouse, location, goods) 组合都应有一行
      expect(lineG1!.locationId).toBe(fx.locationId);
      expect(lineG2!.locationId).toBe(fx.locationId);
    });

    it('C-IM-06-002 冻结期间禁止对范围内 SKU 出入库 (inbound.audit 抛 PRECONDITION_FAILED STOCKTAKE_FROZEN)', async () => {
      const fx = await setupStocktakeFixtures();
      await seedStockFor(fx, fx.goodsId, '100');
      const { caller, stocktake } = await makeDraftStocktake(fx, 'FULL');
      await caller.stocktake.freeze({ id: stocktake.id });

      // 草稿入库单：包含 G1@W1@L1
      const inbound = await caller.inbound.create({
        kind: 'PURCHASE',
        warehouseId: fx.warehouseId,
        operatorId: fx.callerUserId,
        operationAt: new Date('2026-05-03T11:00:00Z'),
        lines: [
          {
            goodsId: fx.goodsId,
            locationId: fx.locationId,
            qty: '10',
          },
        ],
      });
      await caller.inbound.submit({ id: inbound.id });
      await expect(
        caller.inbound.audit({ id: inbound.id }),
      ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

      // Stock 不变
      const stockAfter = await getPrisma().stock.findFirst({
        where: {
          warehouseId: fx.warehouseId,
          locationId: fx.locationId,
          goodsId: fx.goodsId,
        },
      });
      expect(stockAfter!.qtyOnHand).toBe('100');
    });

    it('C-IM-06-003 updateLineActual 自动计算 difference = actualQty - bookQty', async () => {
      const fx = await setupStocktakeFixtures();
      await seedStockFor(fx, fx.goodsId, '100');
      const { caller, stocktake } = await makeDraftStocktake(fx, 'FULL');
      await caller.stocktake.freeze({ id: stocktake.id });

      const lines = await caller.stocktake.listLines({ stocktakeId: stocktake.id });
      const line = (lines as LineRow[]).find((l) => l.goodsId === fx.goodsId)!;
      const updated = await caller.stocktake.updateLineActual({
        id: line.id,
        actualQty: '95',
      });
      expect(updated.actualQty).toBe('95');
      expect(updated.difference).toBe('-5');

      // 持久化校验
      const dbLine = await getPrisma().stocktakeLine.findUnique({ where: { id: line.id } });
      expect(dbLine!.actualQty).toBe('95');
      expect(dbLine!.difference).toBe('-5');
    });

    it('C-IM-06-004 差异非零未填 reason 时 submit 抛 BAD_REQUEST MISSING_DIFFERENCE_REASON', async () => {
      const fx = await setupStocktakeFixtures();
      await seedStockFor(fx, fx.goodsId, '100');
      const { caller, stocktake } = await makeDraftStocktake(fx, 'FULL');
      await caller.stocktake.freeze({ id: stocktake.id });
      const lines = await caller.stocktake.listLines({ stocktakeId: stocktake.id });
      const line = (lines as LineRow[]).find((l) => l.goodsId === fx.goodsId)!;
      // 差异 -5 但不填 reason
      await caller.stocktake.updateLineActual({
        id: line.id,
        actualQty: '95',
      });
      await expect(
        caller.stocktake.submit({ id: stocktake.id }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

      // 状态保持 20
      const after = await getPrisma().stocktake.findUnique({ where: { id: stocktake.id } });
      expect(after!.status).toBe(20);
    });

    it('C-IM-06-005 commit 自动生成盘盈 Inbound + 盘亏 Outbound 并审核，更新 Stock', async () => {
      const fx = await setupStocktakeFixtures();
      // G1 在库 100 → 实盘 105 (盘盈 +5)
      // G2 在库 50  → 实盘 47  (盘亏 -3)
      await seedStockFor(fx, fx.goodsId, '100');
      await seedStockFor(fx, fx.goodsId2, '50');
      const { caller, stocktake } = await makeDraftStocktake(fx, 'FULL');
      await caller.stocktake.freeze({ id: stocktake.id });

      const lines = await caller.stocktake.listLines({ stocktakeId: stocktake.id });
      const typedLines = lines as LineRow[];
      const lineG1 = typedLines.find((l) => l.goodsId === fx.goodsId)!;
      const lineG2 = typedLines.find((l) => l.goodsId === fx.goodsId2)!;
      await caller.stocktake.updateLineActual({
        id: lineG1.id,
        actualQty: '105',
        reason: '盘盈',
      });
      await caller.stocktake.updateLineActual({
        id: lineG2.id,
        actualQty: '47',
        reason: '盘亏',
      });
      await caller.stocktake.submit({ id: stocktake.id });
      const committed = await caller.stocktake.commit({ id: stocktake.id });
      expect(committed.status).toBe(30);

      // 1. Stocktake.gainDocNo / lossDocNo 已写入
      const after = await getPrisma().stocktake.findUnique({ where: { id: stocktake.id } });
      expect(after!.gainDocNo).toBeTruthy();
      expect(after!.lossDocNo).toBeTruthy();

      // 2. 自动生成 Inbound (kind=STOCKTAKE)
      const stocktakeInbounds = await getPrisma().inbound.findMany({
        where: { kind: 'STOCKTAKE', warehouseId: fx.warehouseId },
      });
      expect(stocktakeInbounds.length).toBe(1);
      expect(stocktakeInbounds[0].docNo).toBe(after!.gainDocNo);
      // Inbound 已 audit (status=30 或更高)
      expect(stocktakeInbounds[0].status).toBeGreaterThanOrEqual(30);

      // 3. 自动生成 Outbound (kind=STOCKTAKE)
      const stocktakeOutbounds = await getPrisma().outbound.findMany({
        where: { kind: 'STOCKTAKE', warehouseId: fx.warehouseId },
      });
      expect(stocktakeOutbounds.length).toBe(1);
      expect(stocktakeOutbounds[0].docNo).toBe(after!.lossDocNo);
      // Outbound 已 ship (status=30 或更高)
      expect(stocktakeOutbounds[0].status).toBeGreaterThanOrEqual(30);

      // 4. Stock 已根据差异调整
      const stockG1 = await getPrisma().stock.findFirst({
        where: {
          warehouseId: fx.warehouseId,
          locationId: fx.locationId,
          goodsId: fx.goodsId,
        },
      });
      const stockG2 = await getPrisma().stock.findFirst({
        where: {
          warehouseId: fx.warehouseId,
          locationId: fx.locationId,
          goodsId: fx.goodsId2,
        },
      });
      expect(stockG1!.qtyOnHand).toBe('105'); // 100 + 5
      expect(stockG2!.qtyOnHand).toBe('47'); // 50 - 3
    });

    it('C-IM-06-006 commit 完成后冻结解除，范围内 SKU 可恢复 inbound.audit', async () => {
      const fx = await setupStocktakeFixtures();
      await seedStockFor(fx, fx.goodsId, '100');
      const { caller, stocktake } = await makeDraftStocktake(fx, 'FULL');
      await caller.stocktake.freeze({ id: stocktake.id });
      // 差异 0 直接走完流程
      await fillActualEqualsBook(caller, stocktake.id);
      await caller.stocktake.submit({ id: stocktake.id });
      await caller.stocktake.commit({ id: stocktake.id });

      // 现在创建并审核一张普通入库单 (G1@W1@L1)
      const inbound = await caller.inbound.create({
        kind: 'PURCHASE',
        warehouseId: fx.warehouseId,
        operatorId: fx.callerUserId,
        operationAt: new Date('2026-05-03T12:00:00Z'),
        lines: [
          {
            goodsId: fx.goodsId,
            locationId: fx.locationId,
            qty: '20',
          },
        ],
      });
      await caller.inbound.submit({ id: inbound.id });
      const audited = await caller.inbound.audit({ id: inbound.id });
      expect(audited.status).toBe(30);

      // Stock 正常增加
      const stockAfter = await getPrisma().stock.findFirst({
        where: {
          warehouseId: fx.warehouseId,
          locationId: fx.locationId,
          goodsId: fx.goodsId,
        },
      });
      // commit 使差异 0，在原 100 基础上 +20 = 120
      expect(stockAfter!.qtyOnHand).toBe('120');
    });

    it('C-IM-06-007 cancel (20→90) 不调整库存且无 StockLog 新增', async () => {
      const fx = await setupStocktakeFixtures();
      await seedStockFor(fx, fx.goodsId, '100');
      const { caller, stocktake } = await makeDraftStocktake(fx, 'FULL');
      await caller.stocktake.freeze({ id: stocktake.id });

      // 取消前 stockLog 计数
      const beforeLogs = await getPrisma().stockLog.count({
        where: { goodsId: fx.goodsId },
      });

      const cancelled = await caller.stocktake.cancel({ id: stocktake.id });
      expect(cancelled.status).toBe(90);

      // Stock.qtyOnHand 与 freeze 前一致
      const stock = await getPrisma().stock.findFirst({
        where: {
          warehouseId: fx.warehouseId,
          locationId: fx.locationId,
          goodsId: fx.goodsId,
        },
      });
      expect(stock!.qtyOnHand).toBe('100');

      // 无 StockLog 新增
      const afterLogs = await getPrisma().stockLog.count({
        where: { goodsId: fx.goodsId },
      });
      expect(afterLogs).toBe(beforeLogs);

      // 范围内 SKU 重新可入库
      const inbound = await caller.inbound.create({
        kind: 'PURCHASE',
        warehouseId: fx.warehouseId,
        operatorId: fx.callerUserId,
        operationAt: new Date('2026-05-03T13:00:00Z'),
        lines: [
          {
            goodsId: fx.goodsId,
            locationId: fx.locationId,
            qty: '10',
          },
        ],
      });
      await caller.inbound.submit({ id: inbound.id });
      const audited = await caller.inbound.audit({ id: inbound.id });
      expect(audited.status).toBe(30);
    });
  });

  // --------------------------------------------------------------
  // Audit log integration (P-AUDIT) — ≥ 2 tests
  // --------------------------------------------------------------
  describe('audit log integration (P-AUDIT)', () => {
    it('freeze 操作必落审计日志 entity=Stocktake actionType=FREEZE', async () => {
      const fx = await setupStocktakeFixtures();
      await seedStockFor(fx, fx.goodsId, '100');
      const { caller, stocktake } = await makeDraftStocktake(fx, 'FULL');
      await caller.stocktake.freeze({ id: stocktake.id });
      const logs = await getPrisma().auditLog.findMany({
        where: {
          entity: 'Stocktake',
          entityId: String(stocktake.id),
          actionType: 'FREEZE',
        },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });

    it('commit 操作必落审计日志 entity=Stocktake actionType=COMMIT', async () => {
      const fx = await setupStocktakeFixtures();
      await seedStockFor(fx, fx.goodsId, '100');
      const { caller, stocktake } = await makeDraftStocktake(fx, 'FULL');
      await caller.stocktake.freeze({ id: stocktake.id });
      await fillActualEqualsBook(caller, stocktake.id);
      await caller.stocktake.submit({ id: stocktake.id });
      await caller.stocktake.commit({ id: stocktake.id });
      const logs = await getPrisma().auditLog.findMany({
        where: {
          entity: 'Stocktake',
          entityId: String(stocktake.id),
          actionType: 'COMMIT',
        },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });
  });
});
