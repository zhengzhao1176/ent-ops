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

interface InventoryFixtures {
  callerUserId: bigint;
  warehouseId: bigint;
  locationId: bigint;
  goodsId: bigint;
}

async function setupInventory(): Promise<InventoryFixtures> {
  const { user } = await seedUser({
    employeeNo: 'E_OB',
    username: 'obadmin',
    mobile: '13900000300',
    email: 'ob@a.com',
    status: 'ACTIVE',
    roleCodes: ['ROLE_SUPER_ADMIN'],
  });
  const cat = await seedCategory({});
  const unit = await seedUnit({});
  const goods = await seedGoods({ categoryId: cat.id, unitId: unit.id });
  const warehouse = await seedWarehouse({});
  const location = await seedLocation({ warehouseId: warehouse.id });
  return {
    callerUserId: user.id,
    warehouseId: warehouse.id,
    locationId: location.id,
    goodsId: goods.id,
  };
}

/**
 * Pre-seed a Stock slot so outbound tests can submit/audit/ship against
 * existing inventory.  qtyAvailable is recomputed by the seed.
 */
async function seedStockSlot(
  fx: InventoryFixtures,
  qty: string,
  batchNo = 'B001',
) {
  return seedStock({
    warehouseId: fx.warehouseId,
    locationId: fx.locationId,
    goodsId: fx.goodsId,
    batchNo,
    qtyOnHand: qty,
    qtyLocked: '0',
    qtyAvailable: qty,
    qtyInTransit: '0',
  });
}

async function makeDraftOutbound(
  fx: InventoryFixtures,
  qty = '10',
  batchNo = 'B001',
  pickStrategy: 'FIFO' | 'FEFO' | 'MANUAL' = 'FIFO',
) {
  const c = await callerForUserId(fx.callerUserId);
  const outbound = await c.outbound.create({
    kind: 'SALES',
    warehouseId: fx.warehouseId,
    operatorId: fx.callerUserId,
    operationAt: new Date('2026-05-03T10:00:00Z'),
    pickStrategy,
    lines: [
      {
        goodsId: fx.goodsId,
        locationId: fx.locationId,
        batchNo,
        qty,
      },
    ],
  });
  return { caller: c, outbound };
}

describe('outbound.* master-detail + state machine + side effects', () => {
  beforeEach(async () => {
    await resetDb();
    await seedBaseRoles();
    await seedRootDepartment();
  });

  // --------------------------------------------------------------
  // CRUD + master-detail
  // --------------------------------------------------------------
  describe('create (draft)', () => {
    it('创建出库草稿后状态=10 且包含 lines (kind=SALES, pickStrategy=FIFO)', async () => {
      const fx = await setupInventory();
      await seedStockSlot(fx, '100', 'B001');
      const { outbound } = await makeDraftOutbound(fx, '50', 'B001', 'FIFO');
      expect(outbound.status).toBe(10);
      expect(outbound.kind).toBe('SALES');
      expect(outbound.pickStrategy).toBe('FIFO');
      expect(outbound.lines.length).toBe(1);
      expect(outbound.lines[0].qty).toBe('50');
      expect(outbound.docNo).toBeTruthy();
    });

    it('创建出库时 line.qty 必须 > 0', async () => {
      const fx = await setupInventory();
      const c = await callerForUserId(fx.callerUserId);
      await expect(
        c.outbound.create({
          kind: 'SALES',
          warehouseId: fx.warehouseId,
          operatorId: fx.callerUserId,
          operationAt: new Date(),
          pickStrategy: 'FIFO',
          lines: [
            {
              goodsId: fx.goodsId,
              locationId: fx.locationId,
              qty: '0',
            },
          ],
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('line 的 location 必须属于该出库单的 warehouse', async () => {
      const fx = await setupInventory();
      const c = await callerForUserId(fx.callerUserId);
      const otherWarehouse = await seedWarehouse({});
      const otherLocation = await seedLocation({ warehouseId: otherWarehouse.id });
      await expect(
        c.outbound.create({
          kind: 'SALES',
          warehouseId: fx.warehouseId,
          operatorId: fx.callerUserId,
          operationAt: new Date(),
          pickStrategy: 'FIFO',
          lines: [
            {
              goodsId: fx.goodsId,
              locationId: otherLocation.id,
              qty: '10',
            },
          ],
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('line CRUD on draft', () => {
    it('addLine 在草稿出库单上追加明细', async () => {
      const fx = await setupInventory();
      await seedStockSlot(fx, '100', 'B001');
      const { caller, outbound } = await makeDraftOutbound(fx, '10', 'B001');
      const goods2 = await seedGoods({});
      const line = await caller.outbound.addLine({
        outboundId: outbound.id,
        goodsId: goods2.id,
        locationId: fx.locationId,
        batchNo: 'B002',
        qty: '20',
      });
      expect(line.qty).toBe('20');
      const detail = await caller.outbound.detail({ id: outbound.id });
      expect(detail.lines.length).toBe(2);
    });

    it('updateLine 修改草稿单明细字段', async () => {
      const fx = await setupInventory();
      await seedStockSlot(fx, '100', 'B001');
      const { caller, outbound } = await makeDraftOutbound(fx, '10', 'B001');
      const lineId = outbound.lines[0].id;
      const updated = await caller.outbound.updateLine({ id: lineId, qty: '99' });
      expect(updated.qty).toBe('99');
    });

    it('removeLine 删除草稿单指定明细', async () => {
      const fx = await setupInventory();
      await seedStockSlot(fx, '100', 'B001');
      const { caller, outbound } = await makeDraftOutbound(fx, '10', 'B001');
      const lineId = outbound.lines[0].id;
      await caller.outbound.removeLine({ id: lineId });
      const detail = await caller.outbound.detail({ id: outbound.id });
      expect(detail.lines.length).toBe(0);
    });

    it('已提交单据(20) addLine 应抛 BAD_REQUEST IMMUTABLE_AFTER_AUDIT', async () => {
      const fx = await setupInventory();
      await seedStockSlot(fx, '100', 'B001');
      const { caller, outbound } = await makeDraftOutbound(fx, '10', 'B001');
      await caller.outbound.submit({ id: outbound.id });
      await expect(
        caller.outbound.addLine({
          outboundId: outbound.id,
          goodsId: fx.goodsId,
          locationId: fx.locationId,
          batchNo: 'B999',
          qty: '5',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('已提交单据(20) updateLine / removeLine 应抛 BAD_REQUEST', async () => {
      const fx = await setupInventory();
      await seedStockSlot(fx, '100', 'B001');
      const { caller, outbound } = await makeDraftOutbound(fx, '10', 'B001');
      const lineId = outbound.lines[0].id;
      await caller.outbound.submit({ id: outbound.id });
      await expect(
        caller.outbound.updateLine({ id: lineId, qty: '99' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      await expect(
        caller.outbound.removeLine({ id: lineId }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('已提交单据(20) update header 应抛 BAD_REQUEST', async () => {
      const fx = await setupInventory();
      await seedStockSlot(fx, '100', 'B001');
      const { caller, outbound } = await makeDraftOutbound(fx, '10', 'B001');
      await caller.outbound.submit({ id: outbound.id });
      await expect(
        caller.outbound.update({
          id: outbound.id,
          version: outbound.version,
          remark: '改备注',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  // --------------------------------------------------------------
  // State machine transitions
  // --------------------------------------------------------------
  describe('state machine transitions', () => {
    it('submit 把草稿(10)→已提交(20)', async () => {
      const fx = await setupInventory();
      await seedStockSlot(fx, '100', 'B001');
      const { caller, outbound } = await makeDraftOutbound(fx, '20', 'B001');
      const submitted = await caller.outbound.submit({ id: outbound.id });
      expect(submitted.status).toBe(20);
    });

    it('audit 把已提交(20)→已审核(25) 并锁定库存', async () => {
      const fx = await setupInventory();
      await seedStockSlot(fx, '100', 'B001');
      const { caller, outbound } = await makeDraftOutbound(fx, '30', 'B001');
      await caller.outbound.submit({ id: outbound.id });
      const audited = await caller.outbound.audit({ id: outbound.id });
      expect(audited.status).toBe(25);
      const stock = await getPrisma().stock.findFirst({
        where: {
          warehouseId: fx.warehouseId,
          locationId: fx.locationId,
          goodsId: fx.goodsId,
          batchNo: 'B001',
        },
      });
      expect(stock).toBeTruthy();
      expect(stock!.qtyOnHand).toBe('100');
      expect(stock!.qtyLocked).toBe('30');
      expect(stock!.qtyAvailable).toBe('70');
    });

    it('ship 把已审核(25)→已出库(30) 实际扣减库存并写流水', async () => {
      const fx = await setupInventory();
      await seedStockSlot(fx, '100', 'B001');
      const { caller, outbound } = await makeDraftOutbound(fx, '30', 'B001');
      await caller.outbound.submit({ id: outbound.id });
      await caller.outbound.audit({ id: outbound.id });
      const shipped = await caller.outbound.ship({ id: outbound.id });
      expect(shipped.status).toBe(30);
      const stock = await getPrisma().stock.findFirst({
        where: {
          warehouseId: fx.warehouseId,
          locationId: fx.locationId,
          goodsId: fx.goodsId,
          batchNo: 'B001',
        },
      });
      expect(stock!.qtyOnHand).toBe('70');
      expect(stock!.qtyLocked).toBe('0');
      const logs = await getPrisma().stockLog.findMany({
        where: {
          warehouseId: fx.warehouseId,
          goodsId: fx.goodsId,
          changeType: 'OUTBOUND',
        },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].qtyChange).toBe('-30');
    });

    it('finish 把已出库(30)→已完成(40)', async () => {
      const fx = await setupInventory();
      await seedStockSlot(fx, '100', 'B001');
      const { caller, outbound } = await makeDraftOutbound(fx, '20', 'B001');
      await caller.outbound.submit({ id: outbound.id });
      await caller.outbound.audit({ id: outbound.id });
      await caller.outbound.ship({ id: outbound.id });
      const finished = await caller.outbound.finish({ id: outbound.id });
      expect(finished.status).toBe(40);
    });

    it('void 把草稿(10)→作废(90)', async () => {
      const fx = await setupInventory();
      await seedStockSlot(fx, '100', 'B001');
      const { caller, outbound } = await makeDraftOutbound(fx, '20', 'B001');
      const voided = await caller.outbound.void({ id: outbound.id });
      expect(voided.status).toBe(90);
    });

    it('void 把已提交(20)→作废(90) 不释放锁(尚未锁定)', async () => {
      const fx = await setupInventory();
      await seedStockSlot(fx, '100', 'B001');
      const { caller, outbound } = await makeDraftOutbound(fx, '20', 'B001');
      await caller.outbound.submit({ id: outbound.id });
      const voided = await caller.outbound.void({ id: outbound.id });
      expect(voided.status).toBe(90);
      const stock = await getPrisma().stock.findFirst({
        where: {
          warehouseId: fx.warehouseId,
          locationId: fx.locationId,
          goodsId: fx.goodsId,
          batchNo: 'B001',
        },
      });
      // 20→90 是 lock 之前作废，所以 onHand/locked 应保持初始
      expect(stock!.qtyOnHand).toBe('100');
      expect(stock!.qtyLocked).toBe('0');
    });

    it('C-SM-001 类比：草稿(10)→已审核(25) 跳过 submit 非法', async () => {
      const fx = await setupInventory();
      await seedStockSlot(fx, '100', 'B001');
      const { caller, outbound } = await makeDraftOutbound(fx, '20', 'B001');
      await expect(
        caller.outbound.audit({ id: outbound.id }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('C-SM-002 类比：已完成(40)→任意 transition 非法', async () => {
      const fx = await setupInventory();
      await seedStockSlot(fx, '100', 'B001');
      const { caller, outbound } = await makeDraftOutbound(fx, '20', 'B001');
      await caller.outbound.submit({ id: outbound.id });
      await caller.outbound.audit({ id: outbound.id });
      await caller.outbound.ship({ id: outbound.id });
      await caller.outbound.finish({ id: outbound.id });
      await expect(
        caller.outbound.void({ id: outbound.id }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  // --------------------------------------------------------------
  // Business rules from F-IM-04-EXTRA
  // --------------------------------------------------------------
  describe('F-IM-04-EXTRA business rules', () => {
    it('C-IM-04-001 提交时可用库存不足应抛 PRECONDITION_FAILED INSUFFICIENT_STOCK', async () => {
      // Stock(onHand=10, locked=0) 但 submit qty=20
      // 注：spec 文本 "可用库存不足提交即拒" 把校验放在 SUBMIT。
      const fx = await setupInventory();
      await seedStockSlot(fx, '10', 'B001');
      const { caller, outbound } = await makeDraftOutbound(fx, '20', 'B001');
      await expect(
        caller.outbound.submit({ id: outbound.id }),
      ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    });

    it('C-IM-04-002 审核(audit)成功后立即锁定库存：locked=qty, available=onHand-qty', async () => {
      // 注：spec 原文 "提交成功立即锁定库存"，但 operations.json 状态机
      // 显式定义 25=审核+锁定。本测试以状态机为准，断言锁定发生在 AUDIT 之后。
      const fx = await setupInventory();
      await seedStockSlot(fx, '100', 'B001');
      const { caller, outbound } = await makeDraftOutbound(fx, '30', 'B001');
      await caller.outbound.submit({ id: outbound.id });
      // 锁定动作发生在 audit (10→20→25)
      await caller.outbound.audit({ id: outbound.id });
      const stock = await getPrisma().stock.findFirst({
        where: {
          warehouseId: fx.warehouseId,
          locationId: fx.locationId,
          goodsId: fx.goodsId,
          batchNo: 'B001',
        },
      });
      expect(stock!.qtyLocked).toBe('30');
      expect(stock!.qtyAvailable).toBe('70');
      expect(stock!.qtyOnHand).toBe('100');
    });

    it('C-IM-04-003 ship 扣减在库与锁定，落 OUTBOUND 流水（负数）', async () => {
      const fx = await setupInventory();
      await seedStockSlot(fx, '100', 'B001');
      const { caller, outbound } = await makeDraftOutbound(fx, '30', 'B001');
      await caller.outbound.submit({ id: outbound.id });
      await caller.outbound.audit({ id: outbound.id });
      await caller.outbound.ship({ id: outbound.id });
      const stock = await getPrisma().stock.findFirst({
        where: {
          warehouseId: fx.warehouseId,
          locationId: fx.locationId,
          goodsId: fx.goodsId,
          batchNo: 'B001',
        },
      });
      expect(stock!.qtyOnHand).toBe('70');
      expect(stock!.qtyLocked).toBe('0');
      const logs = await getPrisma().stockLog.findMany({
        where: {
          warehouseId: fx.warehouseId,
          goodsId: fx.goodsId,
          changeType: 'OUTBOUND',
        },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.length).toBe(1);
      expect(logs[0].qtyChange).toBe('-30');
      expect(logs[0].qtyAfter).toBe('70');
    });

    it('C-IM-04-004 FIFO 出库按入库时间：A 早 B 中 C 晚 各 30，总出 50 应 A:30+B:20', async () => {
      const fx = await setupInventory();
      // 三批分别预置（A 最早 → B → C 最晚），通过先后 create 保证 createdAt 递增
      const sA = await seedStockSlot(fx, '30', 'BATCH-A');
      // 不同 batch 为不同 stock 行；通过逐次创建保证时间序
      const sB = await seedStockSlot(fx, '30', 'BATCH-B');
      const sC = await seedStockSlot(fx, '30', 'BATCH-C');
      expect(sA.id).toBeDefined();
      expect(sB.id).toBeDefined();
      expect(sC.id).toBeDefined();

      const c = await callerForUserId(fx.callerUserId);
      // 创建一张总出 50 的单据，pickStrategy=FIFO，line 不指定具体 batch
      // —— 由 service 在 ship 时按 FIFO 分配批次。
      const outbound = await c.outbound.create({
        kind: 'SALES',
        warehouseId: fx.warehouseId,
        operatorId: fx.callerUserId,
        operationAt: new Date('2026-05-03T11:00:00Z'),
        pickStrategy: 'FIFO',
        lines: [
          {
            goodsId: fx.goodsId,
            locationId: fx.locationId,
            qty: '50',
          },
        ],
      });
      await c.outbound.submit({ id: outbound.id });
      await c.outbound.audit({ id: outbound.id });
      await c.outbound.ship({ id: outbound.id });

      const sAAfter = await getPrisma().stock.findUnique({ where: { id: sA.id } });
      const sBAfter = await getPrisma().stock.findUnique({ where: { id: sB.id } });
      const sCAfter = await getPrisma().stock.findUnique({ where: { id: sC.id } });
      // FIFO：A 全部消耗（30→0），B 减 20（30→10），C 不动（30）
      expect(sAAfter!.qtyOnHand).toBe('0');
      expect(sBAfter!.qtyOnHand).toBe('10');
      expect(sCAfter!.qtyOnHand).toBe('30');

      // 流水中应出现两条 OUTBOUND 负数（A 30, B 20）
      const logs = await getPrisma().stockLog.findMany({
        where: { goodsId: fx.goodsId, changeType: 'OUTBOUND' },
        orderBy: { createdAt: 'asc' },
      });
      const changes = logs.map((l) => l.qtyChange).sort();
      expect(changes).toEqual(['-20', '-30'].sort());
    });
  });

  // --------------------------------------------------------------
  // Audit log integration (P-AUDIT)
  // --------------------------------------------------------------
  describe('audit log integration (P-AUDIT)', () => {
    it('audit 操作必落审计日志 entity=Outbound actionType=AUDIT', async () => {
      const fx = await setupInventory();
      await seedStockSlot(fx, '100', 'B001');
      const { caller, outbound } = await makeDraftOutbound(fx, '20', 'B001');
      await caller.outbound.submit({ id: outbound.id });
      await caller.outbound.audit({ id: outbound.id });
      const logs = await getPrisma().auditLog.findMany({
        where: {
          entity: 'Outbound',
          entityId: String(outbound.id),
          actionType: 'AUDIT',
        },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });

    it('ship 操作必落审计日志 entity=Outbound actionType=SHIP', async () => {
      const fx = await setupInventory();
      await seedStockSlot(fx, '100', 'B001');
      const { caller, outbound } = await makeDraftOutbound(fx, '20', 'B001');
      await caller.outbound.submit({ id: outbound.id });
      await caller.outbound.audit({ id: outbound.id });
      await caller.outbound.ship({ id: outbound.id });
      const logs = await getPrisma().auditLog.findMany({
        where: {
          entity: 'Outbound',
          entityId: String(outbound.id),
          actionType: 'SHIP',
        },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });
  });
});
