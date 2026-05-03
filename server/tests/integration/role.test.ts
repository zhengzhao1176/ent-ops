import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, getPrisma } from '../fixtures/db';
import { seedBaseRoles, seedRootDepartment, seedUser } from '../fixtures/factories';
import { callerForUserId } from '../fixtures/caller';

async function adminCaller() {
  const { user } = await seedUser({
    employeeNo: 'E_RA', username: 'roleadmin', mobile: '13900000010', email: 'ra@a.com',
    status: 'ACTIVE', roleCodes: ['ROLE_SUPER_ADMIN'],
  });
  return callerForUserId(user.id);
}

describe('role.* CRUD', () => {
  beforeEach(async () => {
    await resetDb();
    await seedBaseRoles();
    await seedRootDepartment();
  });

  it('创建非内置角色', async () => {
    const c = await adminCaller();
    const r = await c.role.create({ code: 'ROLE_CUSTOM', name: '自定义角色' });
    expect(r.isBuiltin).toBe(false);
  });

  it('编码须以 ROLE_ 开头', async () => {
    const c = await adminCaller();
    await expect(c.role.create({ code: 'CUSTOM', name: 'x' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('编码重复 CONFLICT', async () => {
    const c = await adminCaller();
    await c.role.create({ code: 'ROLE_X', name: 'a' });
    await expect(c.role.create({ code: 'ROLE_X', name: 'b' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('内置角色不可删除', async () => {
    const c = await adminCaller();
    const r = await getPrisma().role.findUniqueOrThrow({ where: { code: 'ROLE_SUPER_ADMIN' } });
    await expect(c.role.delete({ id: r.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('删除前若有用户应 CONFLICT', async () => {
    const c = await adminCaller();
    const r = await c.role.create({ code: 'ROLE_TMP', name: 'tmp' });
    const u = await seedUser({});
    await getPrisma().userRole.create({ data: { userId: u.user.id, roleId: r.id } });
    await expect(c.role.delete({ id: r.id })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('assignPermissions 全量替换', async () => {
    const c = await adminCaller();
    const r = await c.role.create({ code: 'ROLE_AP', name: 'ap' });
    const p1 = await getPrisma().permission.create({ data: { code: 'p1', name: 'p1', kind: 'ACTION' } });
    const p2 = await getPrisma().permission.create({ data: { code: 'p2', name: 'p2', kind: 'ACTION' } });
    await c.role.assignPermissions({ roleId: r.id, permissionIds: [p1.id, p2.id] });
    expect((await getPrisma().rolePermission.findMany({ where: { roleId: r.id } })).length).toBe(2);
    await c.role.assignPermissions({ roleId: r.id, permissionIds: [p1.id] });
    expect((await getPrisma().rolePermission.findMany({ where: { roleId: r.id } })).length).toBe(1);
  });
});
