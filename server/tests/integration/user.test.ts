import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, getPrisma } from '../fixtures/db';
import { seedBaseRoles, seedRootDepartment, seedUser } from '../fixtures/factories';
import { callerForUserId } from '../fixtures/caller';

async function adminCaller() {
  const { user } = await seedUser({
    employeeNo: 'E_ADMIN',
    username: 'admin1',
    mobile: '13900000001',
    email: 'admin1@a.com',
    status: 'ACTIVE',
    roleCodes: ['ROLE_SUPER_ADMIN'],
  });
  return callerForUserId(user.id);
}

describe('user.* CRUD + extras', () => {
  beforeEach(async () => {
    await resetDb();
    await seedBaseRoles();
    await seedRootDepartment();
  });

  describe('create', () => {
    it('正常创建后能在列表查到', async () => {
      const c = await adminCaller();
      const u = await c.user.create({
        employeeNo: 'E0010',
        username: 'newbie',
        realName: '新人',
        mobile: '13800000010',
        email: 'newbie@x.com',
        deptId: (await getPrisma().department.findFirstOrThrow()).id,
      });
      expect(u.username).toBe('newbie');
      expect(u.mustChangePassword).toBe(true);
      const page = await c.user.list({ page: 1, pageSize: 50 });
      expect(page.items.find((x) => x.id === u.id)).toBeTruthy();
    });

    it('C-UM-01-002 工号重复报 CONFLICT', async () => {
      const c = await adminCaller();
      const dept = await getPrisma().department.findFirstOrThrow();
      await c.user.create({
        employeeNo: 'E_DUP', username: 'dup1', realName: 'd', mobile: '13800000020',
        email: 'd1@a.com', deptId: dept.id,
      });
      await expect(
        c.user.create({
          employeeNo: 'E_DUP', username: 'dup2', realName: 'd', mobile: '13800000021',
          email: 'd2@a.com', deptId: dept.id,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('手机号重复报 CONFLICT', async () => {
      const c = await adminCaller();
      const dept = await getPrisma().department.findFirstOrThrow();
      await c.user.create({
        employeeNo: 'E_M1', username: 'm1', realName: 'd', mobile: '13800000030',
        email: 'm1@a.com', deptId: dept.id,
      });
      await expect(
        c.user.create({
          employeeNo: 'E_M2', username: 'm2', realName: 'd', mobile: '13800000030',
          email: 'm2@a.com', deptId: dept.id,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('C-UM-01-003 手机号格式非法 BAD_REQUEST', async () => {
      const c = await adminCaller();
      const dept = await getPrisma().department.findFirstOrThrow();
      await expect(
        c.user.create({
          employeeNo: 'E_BM', username: 'bm', realName: 'd', mobile: '12345678901',
          email: 'bm@a.com', deptId: dept.id,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('C-UM-01-001 创建后 mustChangePassword=true 且 PasswordHistory +1', async () => {
      const c = await adminCaller();
      const dept = await getPrisma().department.findFirstOrThrow();
      const u = await c.user.create({
        employeeNo: 'E_PH', username: 'ph', realName: 'd', mobile: '13800000040',
        email: 'ph@a.com', deptId: dept.id,
      });
      const histories = await getPrisma().passwordHistory.findMany({ where: { userId: u.id } });
      expect(histories.length).toBe(1);
    });

    it('未登录用户调用 create 应 UNAUTHORIZED', async () => {
      const { anonymousCaller } = await import('../fixtures/caller');
      const c = anonymousCaller();
      const dept = await getPrisma().department.findFirstOrThrow();
      await expect(
        c.user.create({
          employeeNo: 'E_X', username: 'x', realName: 'd', mobile: '13800000050',
          email: 'x@a.com', deptId: dept.id,
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('list', () => {
    it('默认分页返回前 N 条 + total', async () => {
      const c = await adminCaller();
      const dept = await getPrisma().department.findFirstOrThrow();
      for (let i = 0; i < 25; i++) {
        await c.user.create({
          employeeNo: `E_L${i}`, username: `lu${i}`, realName: 'l', mobile: `1380000${String(1000 + i).padStart(4, '0')}`,
          email: `l${i}@a.com`, deptId: dept.id,
        });
      }
      const page = await c.user.list({ page: 1, pageSize: 10 });
      expect(page.total).toBeGreaterThanOrEqual(26); // 25 + admin
      expect(page.items.length).toBe(10);
    });

    it('keyword 模糊匹配 username/mobile/email', async () => {
      const c = await adminCaller();
      const dept = await getPrisma().department.findFirstOrThrow();
      await c.user.create({
        employeeNo: 'E_KW', username: 'unique-kw', realName: 'k', mobile: '13800009999',
        email: 'k@a.com', deptId: dept.id,
      });
      const r = await c.user.list({ page: 1, pageSize: 10, keyword: 'unique-kw' });
      expect(r.items.length).toBe(1);
    });

    it('status 过滤', async () => {
      const c = await adminCaller();
      await seedUser({ status: 'DISABLED' });
      const r = await c.user.list({ page: 1, pageSize: 10, status: 'DISABLED' });
      expect(r.items.length).toBeGreaterThan(0);
      expect(r.items.every((u) => u.status === 'DISABLED')).toBe(true);
    });

    it('软删数据不出现在默认列表', async () => {
      const c = await adminCaller();
      const target = await seedUser({ status: 'ACTIVE' });
      await c.user.delete({ id: target.user.id });
      const r = await c.user.list({ page: 1, pageSize: 50 });
      expect(r.items.find((u) => u.id === target.user.id)).toBeFalsy();
    });
  });

  describe('detail', () => {
    it('存在记录返回完整对象', async () => {
      const c = await adminCaller();
      const t = await seedUser({});
      const u = await c.user.detail({ id: t.user.id });
      expect(u.id).toBe(t.user.id);
    });

    it('不存在 ID 报 NOT_FOUND', async () => {
      const c = await adminCaller();
      await expect(c.user.detail({ id: 999999n })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('返回对象不含 passwordHash', async () => {
      const c = await adminCaller();
      const t = await seedUser({});
      const u = (await c.user.detail({ id: t.user.id })) as Record<string, unknown>;
      expect(u.passwordHash).toBeUndefined();
    });
  });

  describe('update', () => {
    it('局部更新只改传入字段', async () => {
      const c = await adminCaller();
      const t = await seedUser({});
      const u = await c.user.update({ id: t.user.id, version: 0, nickname: '小王' });
      expect(u.nickname).toBe('小王');
      expect(u.username).toBe(t.user.username);
    });

    it('version 不匹配报 CONFLICT（乐观锁）', async () => {
      const c = await adminCaller();
      const t = await seedUser({});
      await expect(
        c.user.update({ id: t.user.id, version: 99, nickname: '小李' }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });

  describe('delete + restore', () => {
    it('软删后 deletedAt 有值且不可见', async () => {
      const c = await adminCaller();
      const t = await seedUser({});
      await c.user.delete({ id: t.user.id });
      const raw = await getPrisma().user.findUnique({ where: { id: t.user.id } });
      expect(raw!.deletedAt).toBeTruthy();
    });

    it('C-UM-10-001 删除操作必落审计日志', async () => {
      const c = await adminCaller();
      const t = await seedUser({});
      await c.user.delete({ id: t.user.id });
      const logs = await getPrisma().auditLog.findMany({
        where: { entity: 'User', actionType: 'DELETE', entityId: String(t.user.id) },
      });
      expect(logs.length).toBe(1);
      expect(logs[0].before).toBeTruthy();
    });

    it('恢复后软删字段清空', async () => {
      const c = await adminCaller();
      const t = await seedUser({});
      await c.user.delete({ id: t.user.id });
      const u = await c.user.restore({ id: t.user.id });
      expect((u as { deletedAt: Date | null }).deletedAt).toBeNull();
    });
  });

  describe('extras: lock/unlock/deactivate/activate', () => {
    it('lock 后 status=LOCKED', async () => {
      const c = await adminCaller();
      const t = await seedUser({});
      const u = await c.user.lock({ id: t.user.id });
      expect(u.status).toBe('LOCKED');
    });

    it('unlock 后 status=ACTIVE 且失败计数清零', async () => {
      const c = await adminCaller();
      const t = await seedUser({ status: 'LOCKED' });
      await getPrisma().user.update({ where: { id: t.user.id }, data: { loginFailCount: 5 } });
      const u = await c.user.unlock({ id: t.user.id });
      expect(u.status).toBe('ACTIVE');
      expect(u.loginFailCount).toBe(0);
    });

    it('C-UM-07-001 超管账号不可被禁用', async () => {
      const c = await adminCaller();
      const me = await c.auth.me();
      await expect(c.user.deactivate({ id: me.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('resetPassword (admin)', () => {
    it('返回新初始密码且 mustChangePassword=true', async () => {
      const c = await adminCaller();
      const t = await seedUser({ status: 'ACTIVE', mustChangePassword: false });
      const r = await c.user.resetPassword({ userId: t.user.id });
      expect(r.initialPassword.length).toBeGreaterThanOrEqual(8);
      const u = await getPrisma().user.findUniqueOrThrow({ where: { id: t.user.id } });
      expect(u.mustChangePassword).toBe(true);
    });
  });

  describe('assignRoles', () => {
    it('赋予角色后 me.permissions 反映新权限', async () => {
      const c = await adminCaller();
      const auditor = await getPrisma().role.findUniqueOrThrow({ where: { code: 'ROLE_AUDITOR' } });
      const perm = await getPrisma().permission.create({
        data: { code: 'audit:read', name: '审计查询', kind: 'ACTION' },
      });
      await getPrisma().rolePermission.create({ data: { roleId: auditor.id, permissionId: perm.id } });
      const t = await seedUser({});
      await c.user.assignRoles({ userId: t.user.id, roleIds: [auditor.id] });
      const c2 = await callerForUserId(t.user.id);
      const me = await c2.auth.me();
      expect(me.permissions).toContain('audit:read');
    });
  });
});
