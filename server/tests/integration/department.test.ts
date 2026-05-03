import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, getPrisma } from '../fixtures/db';
import { seedBaseRoles, seedRootDepartment, seedUser } from '../fixtures/factories';
import { callerForUserId } from '../fixtures/caller';

async function adminCaller() {
  const { user } = await seedUser({
    employeeNo: 'E_DA', username: 'deptadmin', mobile: '13900000020', email: 'da@a.com',
    status: 'ACTIVE', roleCodes: ['ROLE_SUPER_ADMIN'],
  });
  return callerForUserId(user.id);
}

describe('department.* tree CRUD', () => {
  beforeEach(async () => {
    await resetDb();
    await seedBaseRoles();
    await seedRootDepartment();
  });

  it('在 ROOT 下创建子部门 path/depth 正确', async () => {
    const c = await adminCaller();
    const root = await getPrisma().department.findUniqueOrThrow({ where: { code: 'ROOT' } });
    const tech = await c.department.create({ code: 'TECH', name: '技术部', parentId: root.id });
    expect(tech.depth).toBe(1);
    expect(tech.path).toBe('/ROOT/TECH');
  });

  it('move 改变父节点后 path/depth 重算', async () => {
    const c = await adminCaller();
    const root = await getPrisma().department.findUniqueOrThrow({ where: { code: 'ROOT' } });
    const a = await c.department.create({ code: 'A', name: 'A', parentId: root.id });
    const b = await c.department.create({ code: 'B', name: 'B', parentId: root.id });
    const a1 = await c.department.create({ code: 'A1', name: 'A1', parentId: a.id });
    const moved = await c.department.move({ id: a1.id, newParentId: b.id });
    expect(moved.path).toBe('/ROOT/B/A1');
    expect(moved.depth).toBe(2);
  });

  it('循环引用拒绝', async () => {
    const c = await adminCaller();
    const root = await getPrisma().department.findUniqueOrThrow({ where: { code: 'ROOT' } });
    const a = await c.department.create({ code: 'X', name: 'X', parentId: root.id });
    const a1 = await c.department.create({ code: 'X1', name: 'X1', parentId: a.id });
    await expect(c.department.move({ id: a.id, newParentId: a1.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('部门下还有用户时不允许删除', async () => {
    const c = await adminCaller();
    const root = await getPrisma().department.findUniqueOrThrow({ where: { code: 'ROOT' } });
    const dep = await c.department.create({ code: 'OPS', name: '运营', parentId: root.id });
    await seedUser({ deptId: dep.id });
    await expect(c.department.delete({ id: dep.id })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
