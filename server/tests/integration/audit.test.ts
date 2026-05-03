import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, getPrisma } from '../fixtures/db';
import { seedBaseRoles, seedRootDepartment, seedUser } from '../fixtures/factories';
import { callerForUserId } from '../fixtures/caller';

describe('audit.* (F-UM-10)', () => {
  beforeEach(async () => {
    await resetDb();
    await seedBaseRoles();
    await seedRootDepartment();
  });

  it('list 按时间倒序', async () => {
    const { user } = await seedUser({
      employeeNo: 'E_AU', username: 'au', mobile: '13900000030', email: 'au@a.com',
      status: 'ACTIVE', roleCodes: ['ROLE_SUPER_ADMIN'],
    });
    const c = await callerForUserId(user.id);
    // 触发若干审计写入
    const dept = await getPrisma().department.findFirstOrThrow();
    const u1 = await c.user.create({
      employeeNo: 'E_X1', username: 'au1', realName: 'a', mobile: '13800009990',
      email: 'au1@x.com', deptId: dept.id,
    });
    await c.user.delete({ id: u1.id });
    const r = await c.audit.list({ page: 1, pageSize: 10, entity: 'User' });
    expect(r.items.length).toBeGreaterThanOrEqual(2);
    expect(r.items[0].createdAt.getTime()).toBeGreaterThanOrEqual(r.items[1].createdAt.getTime());
  });

  it('C-UM-10-002 router 不应暴露 update/delete procedure', async () => {
    const { user } = await seedUser({
      employeeNo: 'E_AU2', username: 'au2', mobile: '13900000031', email: 'au2@a.com',
      status: 'ACTIVE', roleCodes: ['ROLE_SUPER_ADMIN'],
    });
    const c = await callerForUserId(user.id);
    // tRPC client 是 Proxy，需用调用语义验证 procedure 不存在
    const callUpdate = (c.audit as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)
      .update?.({ id: 1n });
    await expect(callUpdate).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const callDelete = (c.audit as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)
      .delete?.({ id: 1n });
    await expect(callDelete).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('权限不足应 FORBIDDEN', async () => {
    const { user } = await seedUser({ status: 'ACTIVE' }); // 无角色
    const c = await callerForUserId(user.id);
    await expect(c.audit.list({ page: 1, pageSize: 10 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
