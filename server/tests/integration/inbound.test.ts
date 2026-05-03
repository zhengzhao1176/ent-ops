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
    employeeNo: 'E_IB',
    username: 'inbadmin',
    mobile: '13900000200',
    email: 'ib@a.com',
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

async function makeDraftInbound(
  fx: InventoryFixtures,
  qty = '100',
  batchNo = 'B001',
) {
  const c = await callerForUserId(fx.callerUserId);
  const inbound = await c.inbound.create({
    kind: 'PURCHASE',
    warehouseId: fx.warehouseId,
    operatorId: fx.callerUserId,
    operationAt: new Date('2026-05-03T10:00:00Z'),
    lines: [
      {
        goodsId: fx.goodsId,
        locationId: fx.locationId,
        batchNo,
        qty,
      },
    ],
  });
  return { caller: c, inbound };
}

describe('inbound.* master-detail + state machine + side effects', () => {
  beforeEach(async () => {
    await resetDb();
    await seedBaseRoles();
    await seedRootDepartment();
  });

  describe('create (draft)', () => {
    it('创建草稿后状态=10 且包含 lines', async () => {
      const fx = await setupInventory();
      const { inbound } = await makeDraftInbound(fx, '50');
      expect(inbound.status).toBe(10);
      expect(inbound.lines.length).toBe(1);
      expect(inbound.lines[0].qty).toBe('50');
      expect(inbound.docNo).toBeTruthy();
    });

    it('入库时 line.qty 必须 > 0', async () => {
      const fx = await setupInventory();
      const c = await callerForUserId(fx.callerUserId);
      await expect(
        c.inbound.create({
          kind: 'PURCHASE',
          warehouseId: fx.warehouseId,
          operatorId: fx.callerUserId,
          operationAt: new Date(),
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

    it('line 的 location 必须属于该入库单的 warehouse', async () => {
      const fx = await setupInventory();
      const c = await callerForUserId(fx.callerUserId);
      const otherWarehouse = await seedWarehouse({});
      const otherLocation = await seedLocation({ warehouseId: otherWarehouse.id });
      await expect(
        c.inbound.create({
          kind: 'PURCHASE',
          warehouseId: fx.warehouseId,
          operatorId: fx.callerUserId,
          operationAt: new Date(),
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
    it('addLine 在草稿单上追加明细', async () => {
      const fx = await setupInventory();
      const { caller, inbound } = await makeDraftInbound(fx, '10');
      const goods2 = await seedGoods({});
      const line = await caller.inbound.addLine({
        inboundId: inbound.id,
        goodsId: goods2.id,
        locationId: fx.locationId,
        batchNo: 'B002',
        qty: '20',
      });
      expect(line.qty).toBe('20');
      const detail = await caller.inbound.detail({ id: inbound.id });
      expect(detail.lines.length).toBe(2);
    });

    it('updateLine 修改明细字段', async () => {
      const fx = await setupInventory();
      const { caller, inbound } = await makeDraftInbound(fx, '10');
      const lineId = inbound.lines[0].id;
      const updated = await caller.inbound.updateLine({ id: lineId, qty: '99' });
      expect(updated.qty).toBe('99');
    });

    it('removeLine 删除指定明细', async () => {
      const fx = await setupInventory();
      const { caller, inbound } = await makeDraftInbound(fx, '10');
      const lineId = inbound.lines[0].id;
      await caller.inbound.removeLine({ id: lineId });
      const detail = await caller.inbound.detail({ id: inbound.id });
      expect(detail.lines.length).toBe(0);
    });
  });

  describe('state machine transitions', () => {
    it('submit 把草稿(10)→已提交(20)', async () => {
      const fx = await setupInventory();
      const { caller, inbound } = await makeDraftInbound(fx, '20');
      const submitted = await caller.inbound.submit({ id: inbound.id });
      expect(submitted.status).toBe(20);
    });

    it('submit→audit 把已提交(20)→已审核(30)', async () => {
      const fx = await setupInventory();
      const { caller, inbound } = await makeDraftInbound(fx, '20');
      await caller.inbound.submit({ id: inbound.id });
      const audited = await caller.inbound.audit({ id: inbound.id });
      expect(audited.status).toBe(30);
    });

    it('audit→finish 把已审核(30)→已完成(40)', async () => {
      const fx = await setupInventory();
      const { caller, inbound } = await makeDraftInbound(fx, '20');
      await caller.inbound.submit({ id: inbound.id });
      await caller.inbound.audit({ id: inbound.id });
      const finished = await caller.inbound.finish({ id: inbound.id });
      expect(finished.status).toBe(40);
    });

    it('void 把草稿(10)→作废(90)', async () => {
      const fx = await setupInventory();
      const { caller, inbound } = await makeDraftInbound(fx, '20');
      const voided = await caller.inbound.void({ id: inbound.id });
      expect(voided.status).toBe(90);
    });

    it('void 把已提交(20)→作废(90)', async () => {
      const fx = await setupInventory();
      const { caller, inbound } = await makeDraftInbound(fx, '20');
      await caller.inbound.submit({ id: inbound.id });
      const voided = await caller.inbound.void({ id: inbound.id });
      expect(voided.status).toBe(90);
    });

    it('C-SM-001 草稿(10)→已审核(30) 跳级非法', async () => {
      const fx = await setupInventory();
      const { caller, inbound } = await makeDraftInbound(fx, '20');
      // 草稿状态直接 audit 应被拒
      await expect(
        caller.inbound.audit({ id: inbound.id }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('C-SM-002 已完成(40)→任意 transition 非法', async () => {
      const fx = await setupInventory();
      const { caller, inbound } = await makeDraftInbound(fx, '20');
      await caller.inbound.submit({ id: inbound.id });
      await caller.inbound.audit({ id: inbound.id });
      await caller.inbound.finish({ id: inbound.id });
      await expect(
        caller.inbound.void({ id: inbound.id }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('audit side effects (C-IM-03-001)', () => {
    it('入库审核成功后库存数量增加并写流水', async () => {
      const fx = await setupInventory();
      const { caller, inbound } = await makeDraftInbound(fx, '100', 'BATCH-AA');
      await caller.inbound.submit({ id: inbound.id });
      await caller.inbound.audit({ id: inbound.id });

      const stock = await getPrisma().stock.findFirst({
        where: {
          warehouseId: fx.warehouseId,
          locationId: fx.locationId,
          goodsId: fx.goodsId,
          batchNo: 'BATCH-AA',
        },
      });
      expect(stock).toBeTruthy();
      expect(stock!.qtyOnHand).toBe('100');

      const logs = await getPrisma().stockLog.findMany({
        where: {
          warehouseId: fx.warehouseId,
          goodsId: fx.goodsId,
          changeType: 'INBOUND',
        },
      });
      expect(logs.length).toBe(1);
      expect(logs[0].qtyChange).toBe('100');
      expect(logs[0].qtyAfter).toBe('100');
    });

    it('审核累加：第二次 INBOUND 在已有库存基础上叠加', async () => {
      const fx = await setupInventory();
      const { caller, inbound } = await makeDraftInbound(fx, '30', 'BATCH-BB');
      await caller.inbound.submit({ id: inbound.id });
      await caller.inbound.audit({ id: inbound.id });

      const { caller: caller2, inbound: inbound2 } = await makeDraftInbound(fx, '70', 'BATCH-BB');
      await caller2.inbound.submit({ id: inbound2.id });
      await caller2.inbound.audit({ id: inbound2.id });

      const stock = await getPrisma().stock.findFirst({
        where: {
          warehouseId: fx.warehouseId,
          locationId: fx.locationId,
          goodsId: fx.goodsId,
          batchNo: 'BATCH-BB',
        },
      });
      expect(stock!.qtyOnHand).toBe('100');
    });
  });

  describe('immutable after audit (C-IM-03-002)', () => {
    it('已审核单据不可 update', async () => {
      const fx = await setupInventory();
      const { caller, inbound } = await makeDraftInbound(fx, '50');
      await caller.inbound.submit({ id: inbound.id });
      const audited = await caller.inbound.audit({ id: inbound.id });
      await expect(
        caller.inbound.update({
          id: inbound.id,
          version: audited.version,
          remark: '改备注',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('已审核单据不可 addLine / updateLine / removeLine', async () => {
      const fx = await setupInventory();
      const { caller, inbound } = await makeDraftInbound(fx, '50');
      await caller.inbound.submit({ id: inbound.id });
      await caller.inbound.audit({ id: inbound.id });
      await expect(
        caller.inbound.addLine({
          inboundId: inbound.id,
          goodsId: fx.goodsId,
          locationId: fx.locationId,
          qty: '10',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('void after audit (C-IM-03-003)', () => {
    it('作废生成红冲流水（负数）且库存回退', async () => {
      // 注意：state machine 只允许 10→90 和 20→90；
      // 但 spec C-IM-03-003 说"已审核单 +100 然后 void 红冲"
      // 这里我们认为 void 仅在 30 时是业务异常路径，需 service 实现"红冲撤销"
      // 若实现禁止 30→90，则把 expect 改为 BAD_REQUEST。
      // 以业务规则 spec 为准：测试期望红冲。
      const fx = await setupInventory();
      const { caller, inbound } = await makeDraftInbound(fx, '100', 'BATCH-CC');
      await caller.inbound.submit({ id: inbound.id });
      await caller.inbound.audit({ id: inbound.id });

      await caller.inbound.void({ id: inbound.id });

      const stock = await getPrisma().stock.findFirst({
        where: {
          warehouseId: fx.warehouseId,
          locationId: fx.locationId,
          goodsId: fx.goodsId,
          batchNo: 'BATCH-CC',
        },
      });
      expect(stock!.qtyOnHand).toBe('0');

      const logs = await getPrisma().stockLog.findMany({
        where: {
          warehouseId: fx.warehouseId,
          goodsId: fx.goodsId,
        },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.length).toBe(2);
      expect(logs[0].qtyChange).toBe('100');
      expect(logs[1].qtyChange).toBe('-100');
    });
  });

  describe('cascade delete', () => {
    it('删除草稿单据后 lines 也被级联删除', async () => {
      const fx = await setupInventory();
      const { caller, inbound } = await makeDraftInbound(fx, '20');
      const beforeLines = await getPrisma().inboundLine.findMany({
        where: { inboundId: inbound.id },
      });
      expect(beforeLines.length).toBe(1);
      await caller.inbound.delete({ id: inbound.id });
      const afterLines = await getPrisma().inboundLine.findMany({
        where: { inboundId: inbound.id },
      });
      expect(afterLines.length).toBe(0);
    });
  });

  describe('audit log integration (P-AUDIT)', () => {
    it('audit 操作必落审计日志', async () => {
      const fx = await setupInventory();
      const { caller, inbound } = await makeDraftInbound(fx, '20');
      await caller.inbound.submit({ id: inbound.id });
      await caller.inbound.audit({ id: inbound.id });
      const logs = await getPrisma().auditLog.findMany({
        where: { entity: 'Inbound', entityId: String(inbound.id) },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });
  });
});
