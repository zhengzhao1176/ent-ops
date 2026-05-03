import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, getPrisma } from '../fixtures/db';
import {
  seedBaseRoles,
  seedRootDepartment,
  seedUser,
  seedCategory,
  seedUnit,
  seedGoods,
} from '../fixtures/factories';
import { callerForUserId, anonymousCaller } from '../fixtures/caller';

async function adminCaller() {
  const { user } = await seedUser({
    employeeNo: 'E_GA',
    username: 'goodsadmin',
    mobile: '13900000100',
    email: 'ga@a.com',
    status: 'ACTIVE',
    roleCodes: ['ROLE_SUPER_ADMIN'],
  });
  return callerForUserId(user.id);
}

describe('goods.* CRUD', () => {
  beforeEach(async () => {
    await resetDb();
    await seedBaseRoles();
    await seedRootDepartment();
  });

  describe('create', () => {
    it('正常创建商品后能在列表查到', async () => {
      const c = await adminCaller();
      const cat = await seedCategory({});
      const unit = await seedUnit({});
      const g = await c.goods.create({
        code: 'SKU-A001',
        name: '商品A',
        categoryId: cat.id,
        unitId: unit.id,
      });
      expect(g.code).toBe('SKU-A001');
      expect(g.status).toBe('ACTIVE');
      expect(g.version).toBe(0);
      const page = await c.goods.list({ page: 1, pageSize: 50 });
      expect(page.items.find((x: { id: bigint }) => x.id === g.id)).toBeTruthy();
    });

    it('编码重复报 CONFLICT', async () => {
      const c = await adminCaller();
      const cat = await seedCategory({});
      const unit = await seedUnit({});
      await c.goods.create({
        code: 'SKU-DUP',
        name: '商品X',
        categoryId: cat.id,
        unitId: unit.id,
      });
      await expect(
        c.goods.create({
          code: 'SKU-DUP',
          name: '商品Y',
          categoryId: cat.id,
          unitId: unit.id,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('编码格式非法 BAD_REQUEST', async () => {
      const c = await adminCaller();
      const cat = await seedCategory({});
      const unit = await seedUnit({});
      await expect(
        c.goods.create({
          code: '非法 编码',
          name: '商品Z',
          categoryId: cat.id,
          unitId: unit.id,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('未登录用户调用 create 应 UNAUTHORIZED', async () => {
      const cat = await seedCategory({});
      const unit = await seedUnit({});
      const c = anonymousCaller();
      await expect(
        c.goods.create({
          code: 'SKU-NOAUTH',
          name: '匿名',
          categoryId: cat.id,
          unitId: unit.id,
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('list', () => {
    it('keyword 模糊匹配商品名/编码', async () => {
      const c = await adminCaller();
      const cat = await seedCategory({});
      const unit = await seedUnit({});
      await seedGoods({ code: 'SKU-KW1', name: '关键字商品', categoryId: cat.id, unitId: unit.id });
      await seedGoods({ code: 'SKU-OTHER', name: '其他商品', categoryId: cat.id, unitId: unit.id });
      const r = await c.goods.list({ page: 1, pageSize: 50, keyword: '关键字' });
      expect(r.items.length).toBe(1);
      expect(r.items[0].code).toBe('SKU-KW1');
    });

    it('categoryId 过滤只返回该分类的商品', async () => {
      const c = await adminCaller();
      const catA = await seedCategory({ code: 'CAT-A' });
      const catB = await seedCategory({ code: 'CAT-B' });
      const unit = await seedUnit({});
      await seedGoods({ categoryId: catA.id, unitId: unit.id });
      await seedGoods({ categoryId: catA.id, unitId: unit.id });
      await seedGoods({ categoryId: catB.id, unitId: unit.id });
      const r = await c.goods.list({ page: 1, pageSize: 50, categoryId: catA.id });
      expect(r.items.length).toBe(2);
      expect(r.items.every((g: { categoryId: bigint }) => g.categoryId === catA.id)).toBe(true);
    });

    it('软删数据不出现在默认列表', async () => {
      const c = await adminCaller();
      const target = await seedGoods({});
      await c.goods.delete({ id: target.id });
      const r = await c.goods.list({ page: 1, pageSize: 50 });
      expect(r.items.find((g: { id: bigint }) => g.id === target.id)).toBeFalsy();
    });
  });

  describe('detail', () => {
    it('存在记录返回完整对象', async () => {
      const c = await adminCaller();
      const t = await seedGoods({});
      const g = await c.goods.detail({ id: t.id });
      expect(g.id).toBe(t.id);
      expect(g.code).toBe(t.code);
    });

    it('不存在 ID 报 NOT_FOUND', async () => {
      const c = await adminCaller();
      // First create one so detail() handler must exist; then ask for missing id.
      await seedGoods({});
      const r = await c.goods.list({ page: 1, pageSize: 1 });
      expect(r).toBeTruthy(); // forces router to be registered
      await expect(c.goods.detail({ id: 999999n })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('软删后 detail 报 NOT_FOUND', async () => {
      const c = await adminCaller();
      const t = await seedGoods({});
      await c.goods.delete({ id: t.id });
      await expect(c.goods.detail({ id: t.id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('update', () => {
    it('局部更新只改传入字段', async () => {
      const c = await adminCaller();
      const t = await seedGoods({ name: '原名' });
      const g = await c.goods.update({ id: t.id, version: 0, name: '新名' });
      expect(g.name).toBe('新名');
      expect(g.code).toBe(t.code);
    });

    it('version 不匹配报 CONFLICT（乐观锁）', async () => {
      const c = await adminCaller();
      const t = await seedGoods({});
      await expect(
        c.goods.update({ id: t.id, version: 99, name: '新名' }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('更新不存在 ID 报 NOT_FOUND', async () => {
      const c = await adminCaller();
      // First do a create() so router must be registered;
      // then ask to update missing id.
      const cat = await seedCategory({});
      const unit = await seedUnit({});
      await c.goods.create({
        code: 'SKU-PROBE',
        name: '探针',
        categoryId: cat.id,
        unitId: unit.id,
      });
      await expect(
        c.goods.update({ id: 999999n, version: 0, name: '新名' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('delete + restore', () => {
    it('软删后 deletedAt 有值', async () => {
      const c = await adminCaller();
      const t = await seedGoods({});
      await c.goods.delete({ id: t.id });
      const raw = await getPrisma().goods.findUnique({ where: { id: t.id } });
      expect(raw!.deletedAt).toBeTruthy();
    });

    it('软删后 list 不可见', async () => {
      const c = await adminCaller();
      const t = await seedGoods({});
      await c.goods.delete({ id: t.id });
      const r = await c.goods.list({ page: 1, pageSize: 50 });
      expect(r.items.find((g: { id: bigint }) => g.id === t.id)).toBeFalsy();
    });

    it('恢复后软删字段清空', async () => {
      const c = await adminCaller();
      const t = await seedGoods({});
      await c.goods.delete({ id: t.id });
      const restored = await c.goods.restore({ id: t.id });
      const raw = await getPrisma().goods.findUnique({ where: { id: t.id } });
      expect(raw!.deletedAt).toBeNull();
      expect(restored.id).toBe(t.id);
    });

    it('删除商品操作必落审计日志', async () => {
      const c = await adminCaller();
      const t = await seedGoods({});
      await c.goods.delete({ id: t.id });
      const logs = await getPrisma().auditLog.findMany({
        where: { entity: 'Goods', actionType: 'DELETE', entityId: String(t.id) },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('disable', () => {
    it('disable 后 status=DISABLED', async () => {
      const c = await adminCaller();
      const t = await seedGoods({ status: 'ACTIVE' });
      const g = await c.goods.disable({ id: t.id });
      expect(g.status).toBe('DISABLED');
    });
  });
});
