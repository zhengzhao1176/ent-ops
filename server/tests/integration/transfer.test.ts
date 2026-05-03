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

interface TransferFixtures {
  callerUserId: bigint;
  fromWarehouseId: bigint;
  fromLocationId: bigint;
  toWarehouseId: bigint;
  toLocationId: bigint;
  goodsId: bigint;
}

async function setupTransferFixtures(): Promise<TransferFixtures> {
  const { user } = await seedUser({
    employeeNo: 'E_TR',
    username: 'tradmin',
    mobile: '13900000400',
    email: 'tr@a.com',
    status: 'ACTIVE',
    roleCodes: ['ROLE_SUPER_ADMIN'],
  });
  const cat = await seedCategory({});
  const unit = await seedUnit({});
  const goods = await seedGoods({ categoryId: cat.id, unitId: unit.id });
  const fromWarehouse = await seedWarehouse({});
  const fromLocation = await seedLocation({ warehouseId: fromWarehouse.id });
  const toWarehouse = await seedWarehouse({});
  const toLocation = await seedLocation({ warehouseId: toWarehouse.id });
  return {
    callerUserId: user.id,
    fromWarehouseId: fromWarehouse.id,
    fromLocationId: fromLocation.id,
    toWarehouseId: toWarehouse.id,
    toLocationId: toLocation.id,
    goodsId: goods.id,
  };
}

/**
 * Pre-seed a Stock slot at the from-warehouse so transfer tests can submit/audit
 * against existing inventory.  qtyAvailable is recomputed by the seed.
 */
async function seedFromStock(
  fx: TransferFixtures,
  qty: string,
  batchNo = 'B001',
) {
  return seedStock({
    warehouseId: fx.fromWarehouseId,
    locationId: fx.fromLocationId,
    goodsId: fx.goodsId,
    batchNo,
    qtyOnHand: qty,
    qtyLocked: '0',
    qtyAvailable: qty,
    qtyInTransit: '0',
  });
}

async function makeDraftTransfer(
  fx: TransferFixtures,
  qty = '50',
  batchNo = 'B001',
) {
  const c = await callerForUserId(fx.callerUserId);
  const transfer = await c.transfer.create({
    kind: 'INTERNAL',
    fromWarehouseId: fx.fromWarehouseId,
    fromLocationId: fx.fromLocationId,
    toWarehouseId: fx.toWarehouseId,
    toLocationId: fx.toLocationId,
    operatorId: fx.callerUserId,
    operationAt: new Date('2026-05-03T10:00:00Z'),
    lines: [
      {
        goodsId: fx.goodsId,
        batchNo,
        qty,
      },
    ],
  });
  return { caller: c, transfer };
}

describe('transfer.* master-detail + state machine + side effects', () => {
  beforeEach(async () => {
    await resetDb();
    await seedBaseRoles();
    await seedRootDepartment();
  });

  // --------------------------------------------------------------
  // CRUD + master-detail
  // --------------------------------------------------------------
  describe('create (draft)', () => {
    it('创建调拨草稿后状态=10 且包含 lines (kind=INTERNAL)', async () => {
      const fx = await setupTransferFixtures();
      const { transfer } = await makeDraftTransfer(fx, '50', 'B001');
      expect(transfer.status).toBe(10);
      expect(transfer.kind).toBe('INTERNAL');
      expect(transfer.fromWarehouseId).toBe(fx.fromWarehouseId);
      expect(transfer.fromLocationId).toBe(fx.fromLocationId);
      expect(transfer.toWarehouseId).toBe(fx.toWarehouseId);
      expect(transfer.toLocationId).toBe(fx.toLocationId);
      expect(transfer.lines.length).toBe(1);
      expect(transfer.lines[0].qty).toBe('50');
      expect(transfer.docNo).toBeTruthy();
    });

    it('创建调拨时 line.qty 必须 > 0', async () => {
      const fx = await setupTransferFixtures();
      const c = await callerForUserId(fx.callerUserId);
      await expect(
        c.transfer.create({
          kind: 'INTERNAL',
          fromWarehouseId: fx.fromWarehouseId,
          fromLocationId: fx.fromLocationId,
          toWarehouseId: fx.toWarehouseId,
          toLocationId: fx.toLocationId,
          operatorId: fx.callerUserId,
          operationAt: new Date(),
          lines: [
            {
              goodsId: fx.goodsId,
              qty: '0',
            },
          ],
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('fromLocation 必须属于 fromWarehouse', async () => {
      const fx = await setupTransferFixtures();
      const c = await callerForUserId(fx.callerUserId);
      // fromLocation 实际属于 toWarehouse(其它仓)
      const otherWh = await seedWarehouse({});
      const wrongLoc = await seedLocation({ warehouseId: otherWh.id });
      await expect(
        c.transfer.create({
          kind: 'INTERNAL',
          fromWarehouseId: fx.fromWarehouseId,
          fromLocationId: wrongLoc.id,
          toWarehouseId: fx.toWarehouseId,
          toLocationId: fx.toLocationId,
          operatorId: fx.callerUserId,
          operationAt: new Date(),
          lines: [{ goodsId: fx.goodsId, qty: '5' }],
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('toLocation 必须属于 toWarehouse', async () => {
      const fx = await setupTransferFixtures();
      const c = await callerForUserId(fx.callerUserId);
      // toLocation 实际属于 fromWarehouse
      await expect(
        c.transfer.create({
          kind: 'INTERNAL',
          fromWarehouseId: fx.fromWarehouseId,
          fromLocationId: fx.fromLocationId,
          toWarehouseId: fx.toWarehouseId,
          toLocationId: fx.fromLocationId, // 错: 属于 fromWarehouse
          operatorId: fx.callerUserId,
          operationAt: new Date(),
          lines: [{ goodsId: fx.goodsId, qty: '5' }],
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('fromWarehouse 不能等于 toWarehouse (INVALID_TRANSFER_TARGET)', async () => {
      const fx = await setupTransferFixtures();
      const c = await callerForUserId(fx.callerUserId);
      // 在 fromWarehouse 下另开一个 location，作为 to
      const anotherLoc = await seedLocation({ warehouseId: fx.fromWarehouseId });
      await expect(
        c.transfer.create({
          kind: 'INTERNAL',
          fromWarehouseId: fx.fromWarehouseId,
          fromLocationId: fx.fromLocationId,
          toWarehouseId: fx.fromWarehouseId, // 同仓
          toLocationId: anotherLoc.id,
          operatorId: fx.callerUserId,
          operationAt: new Date(),
          lines: [{ goodsId: fx.goodsId, qty: '5' }],
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('line CRUD on draft (status=10)', () => {
    it('addLine 在草稿调拨单上追加明细', async () => {
      const fx = await setupTransferFixtures();
      const { caller, transfer } = await makeDraftTransfer(fx, '10', 'B001');
      const goods2 = await seedGoods({});
      const line = await caller.transfer.addLine({
        transferId: transfer.id,
        goodsId: goods2.id,
        batchNo: 'B002',
        qty: '20',
      });
      expect(line.qty).toBe('20');
      const detail = await caller.transfer.detail({ id: transfer.id });
      expect(detail.lines.length).toBe(2);
    });

    it('updateLine 修改草稿单明细字段', async () => {
      const fx = await setupTransferFixtures();
      const { caller, transfer } = await makeDraftTransfer(fx, '10', 'B001');
      const lineId = transfer.lines[0].id;
      const updated = await caller.transfer.updateLine({ id: lineId, qty: '99' });
      expect(updated.qty).toBe('99');
    });

    it('removeLine 删除草稿单指定明细', async () => {
      const fx = await setupTransferFixtures();
      const { caller, transfer } = await makeDraftTransfer(fx, '10', 'B001');
      const lineId = transfer.lines[0].id;
      await caller.transfer.removeLine({ id: lineId });
      const detail = await caller.transfer.detail({ id: transfer.id });
      expect(detail.lines.length).toBe(0);
    });

    it('已提交单据(20) addLine 应抛 BAD_REQUEST', async () => {
      const fx = await setupTransferFixtures();
      await seedFromStock(fx, '100', 'B001');
      const { caller, transfer } = await makeDraftTransfer(fx, '10', 'B001');
      await caller.transfer.submit({ id: transfer.id });
      await expect(
        caller.transfer.addLine({
          transferId: transfer.id,
          goodsId: fx.goodsId,
          batchNo: 'B999',
          qty: '5',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  // --------------------------------------------------------------
  // State machine transitions
  // --------------------------------------------------------------
  describe('state machine transitions', () => {
    it('submit 把草稿(10)→已提交(20)', async () => {
      const fx = await setupTransferFixtures();
      await seedFromStock(fx, '100', 'B001');
      const { caller, transfer } = await makeDraftTransfer(fx, '20', 'B001');
      const submitted = await caller.transfer.submit({ id: transfer.id });
      expect(submitted.status).toBe(20);
    });

    it('audit 把已提交(20)→已审核(25) 调出仓出库 + 在途库存', async () => {
      const fx = await setupTransferFixtures();
      await seedFromStock(fx, '100', 'B001');
      const { caller, transfer } = await makeDraftTransfer(fx, '30', 'B001');
      await caller.transfer.submit({ id: transfer.id });
      const audited = await caller.transfer.audit({ id: transfer.id });
      expect(audited.status).toBe(25);

      // 调出仓 onHand 应减少
      const fromStock = await getPrisma().stock.findFirst({
        where: {
          warehouseId: fx.fromWarehouseId,
          locationId: fx.fromLocationId,
          goodsId: fx.goodsId,
          batchNo: 'B001',
        },
      });
      expect(fromStock).toBeTruthy();
      expect(fromStock!.qtyOnHand).toBe('70');
    });

    it('receive 把已审核(25)→已收货(30) 调入仓收货 + 在途消化', async () => {
      const fx = await setupTransferFixtures();
      await seedFromStock(fx, '100', 'B001');
      const { caller, transfer } = await makeDraftTransfer(fx, '30', 'B001');
      await caller.transfer.submit({ id: transfer.id });
      await caller.transfer.audit({ id: transfer.id });
      const received = await caller.transfer.receive({ id: transfer.id });
      expect(received.status).toBe(30);

      // 调入仓 onHand 应增加
      const toStock = await getPrisma().stock.findFirst({
        where: {
          warehouseId: fx.toWarehouseId,
          locationId: fx.toLocationId,
          goodsId: fx.goodsId,
          batchNo: 'B001',
        },
      });
      expect(toStock).toBeTruthy();
      expect(toStock!.qtyOnHand).toBe('30');
    });

    it('finish 把已收货(30)→已完成(40)', async () => {
      const fx = await setupTransferFixtures();
      await seedFromStock(fx, '100', 'B001');
      const { caller, transfer } = await makeDraftTransfer(fx, '20', 'B001');
      await caller.transfer.submit({ id: transfer.id });
      await caller.transfer.audit({ id: transfer.id });
      await caller.transfer.receive({ id: transfer.id });
      const finished = await caller.transfer.finish({ id: transfer.id });
      expect(finished.status).toBe(40);
    });

    it('void 把草稿(10)→作废(90)', async () => {
      const fx = await setupTransferFixtures();
      const { caller, transfer } = await makeDraftTransfer(fx, '20', 'B001');
      const voided = await caller.transfer.void({ id: transfer.id });
      expect(voided.status).toBe(90);
    });

    it('void 把已提交(20)→作废(90)', async () => {
      const fx = await setupTransferFixtures();
      await seedFromStock(fx, '100', 'B001');
      const { caller, transfer } = await makeDraftTransfer(fx, '20', 'B001');
      await caller.transfer.submit({ id: transfer.id });
      const voided = await caller.transfer.void({ id: transfer.id });
      expect(voided.status).toBe(90);
    });

    it('草稿(10)→已审核(25) 跳级非法 (必须先 submit)', async () => {
      const fx = await setupTransferFixtures();
      await seedFromStock(fx, '100', 'B001');
      const { caller, transfer } = await makeDraftTransfer(fx, '20', 'B001');
      await expect(
        caller.transfer.audit({ id: transfer.id }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('已审核(25)→已完成(40) 跳级非法 (必须经过 receive)', async () => {
      const fx = await setupTransferFixtures();
      await seedFromStock(fx, '100', 'B001');
      const { caller, transfer } = await makeDraftTransfer(fx, '20', 'B001');
      await caller.transfer.submit({ id: transfer.id });
      await caller.transfer.audit({ id: transfer.id });
      await expect(
        caller.transfer.finish({ id: transfer.id }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  // --------------------------------------------------------------
  // Business rules from F-IM-05
  //
  // 在途机制选型说明：
  //   audit (20→25) 时调出仓直接 -qty 写 onHand，并把 qty 累加到调入仓的
  //   `qtyInTransit` (利用 stocks.qty_in_transit 字段) 作为"在途"标记。
  //   receive (25→30) 时调入仓 onHand += shippedQty 并把 qtyInTransit -= 该 qty
  //   消化在途。本测试以此契约为准。
  // --------------------------------------------------------------
  describe('F-IM-05 business rules', () => {
    it('audit (20→25): fromStock onHand 减少 + 写 TRANSFER_OUT 流水 + 在途累加到 toStock', async () => {
      const fx = await setupTransferFixtures();
      await seedFromStock(fx, '100', 'B001');
      const { caller, transfer } = await makeDraftTransfer(fx, '40', 'B001');
      await caller.transfer.submit({ id: transfer.id });
      await caller.transfer.audit({ id: transfer.id });

      const fromStock = await getPrisma().stock.findFirst({
        where: {
          warehouseId: fx.fromWarehouseId,
          locationId: fx.fromLocationId,
          goodsId: fx.goodsId,
          batchNo: 'B001',
        },
      });
      expect(fromStock).toBeTruthy();
      expect(fromStock!.qtyOnHand).toBe('60');

      // 流水：TRANSFER_OUT 负数
      const outLogs = await getPrisma().stockLog.findMany({
        where: {
          warehouseId: fx.fromWarehouseId,
          goodsId: fx.goodsId,
          changeType: 'TRANSFER_OUT',
        },
      });
      expect(outLogs.length).toBe(1);
      expect(outLogs[0].qtyChange).toBe('-40');

      // 在途库存：调入仓位置应已建 stock 行（qtyInTransit=40）
      const toStockInTransit = await getPrisma().stock.findFirst({
        where: {
          warehouseId: fx.toWarehouseId,
          locationId: fx.toLocationId,
          goodsId: fx.goodsId,
          batchNo: 'B001',
        },
      });
      expect(toStockInTransit).toBeTruthy();
      expect(toStockInTransit!.qtyInTransit).toBe('40');
      // 在 receive 之前 onHand 仍为 0
      expect(toStockInTransit!.qtyOnHand).toBe('0');
    });

    it('receive (25→30): toStock onHand += shippedQty + 写 TRANSFER_IN 流水', async () => {
      const fx = await setupTransferFixtures();
      await seedFromStock(fx, '100', 'B001');
      const { caller, transfer } = await makeDraftTransfer(fx, '40', 'B001');
      await caller.transfer.submit({ id: transfer.id });
      await caller.transfer.audit({ id: transfer.id });
      await caller.transfer.receive({ id: transfer.id });

      const toStock = await getPrisma().stock.findFirst({
        where: {
          warehouseId: fx.toWarehouseId,
          locationId: fx.toLocationId,
          goodsId: fx.goodsId,
          batchNo: 'B001',
        },
      });
      expect(toStock).toBeTruthy();
      // shippedQty 默认 = line.qty = 40
      expect(toStock!.qtyOnHand).toBe('40');
      // 在途消化
      expect(toStock!.qtyInTransit).toBe('0');

      const inLogs = await getPrisma().stockLog.findMany({
        where: {
          warehouseId: fx.toWarehouseId,
          goodsId: fx.goodsId,
          changeType: 'TRANSFER_IN',
        },
      });
      expect(inLogs.length).toBe(1);
      expect(inLogs[0].qtyChange).toBe('40');
    });

    it('audit 时 fromStock onHand 不足应抛 PRECONDITION_FAILED INSUFFICIENT_STOCK', async () => {
      const fx = await setupTransferFixtures();
      // 只有 10，但要 20
      await seedFromStock(fx, '10', 'B001');
      const { caller, transfer } = await makeDraftTransfer(fx, '20', 'B001');
      await caller.transfer.submit({ id: transfer.id });
      await expect(
        caller.transfer.audit({ id: transfer.id }),
      ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    });

    it('receive 时若 line.receivedQty < line.shippedQty 应记录差异 (受短量)', async () => {
      const fx = await setupTransferFixtures();
      await seedFromStock(fx, '100', 'B001');
      const { caller, transfer } = await makeDraftTransfer(fx, '40', 'B001');
      await caller.transfer.submit({ id: transfer.id });
      await caller.transfer.audit({ id: transfer.id });

      // 在 receive 前更新 line.receivedQty=30 (短缺 10)
      const lineId = transfer.lines[0].id;
      await caller.transfer.updateLine({
        id: lineId,
        receivedQty: '30',
      });
      await caller.transfer.receive({ id: transfer.id });

      const lineAfter = await getPrisma().transferLine.findUnique({
        where: { id: lineId },
      });
      expect(lineAfter!.receivedQty).toBe('30');
      // shippedQty 默认 40 (audit 设置)
      expect(lineAfter!.shippedQty).toBe('40');

      // toStock 入库按 receivedQty=30 (差异不入库)
      const toStock = await getPrisma().stock.findFirst({
        where: {
          warehouseId: fx.toWarehouseId,
          locationId: fx.toLocationId,
          goodsId: fx.goodsId,
          batchNo: 'B001',
        },
      });
      expect(toStock!.qtyOnHand).toBe('30');
    });
  });

  // --------------------------------------------------------------
  // Audit log integration (P-AUDIT)
  // --------------------------------------------------------------
  describe('audit log integration (P-AUDIT)', () => {
    it('audit 操作必落审计日志 entity=Transfer actionType=AUDIT', async () => {
      const fx = await setupTransferFixtures();
      await seedFromStock(fx, '100', 'B001');
      const { caller, transfer } = await makeDraftTransfer(fx, '20', 'B001');
      await caller.transfer.submit({ id: transfer.id });
      await caller.transfer.audit({ id: transfer.id });
      const logs = await getPrisma().auditLog.findMany({
        where: {
          entity: 'Transfer',
          entityId: String(transfer.id),
          actionType: 'AUDIT',
        },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });

    it('receive 操作必落审计日志 entity=Transfer actionType=RECEIVE', async () => {
      const fx = await setupTransferFixtures();
      await seedFromStock(fx, '100', 'B001');
      const { caller, transfer } = await makeDraftTransfer(fx, '20', 'B001');
      await caller.transfer.submit({ id: transfer.id });
      await caller.transfer.audit({ id: transfer.id });
      await caller.transfer.receive({ id: transfer.id });
      const logs = await getPrisma().auditLog.findMany({
        where: {
          entity: 'Transfer',
          entityId: String(transfer.id),
          actionType: 'RECEIVE',
        },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });
  });
});
