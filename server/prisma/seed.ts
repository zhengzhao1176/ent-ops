import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ROLE_DEFS: { code: string; name: string }[] = [
  { code: 'ROLE_SUPER_ADMIN',    name: '超级管理员' },
  { code: 'ROLE_SYS_ADMIN',      name: '系统管理员' },
  { code: 'ROLE_WAREHOUSE_MGR',  name: '仓库主管' },
  { code: 'ROLE_WAREHOUSE_OP',   name: '仓库管理员' },
  { code: 'ROLE_PURCHASER',      name: '采购员' },
  { code: 'ROLE_SALES',          name: '销售员' },
  { code: 'ROLE_AUDITOR',        name: '审计员' },
  { code: 'ROLE_USER',           name: '普通用户' },
];

const PERM_DEFS: { code: string; name: string; kind: 'MENU' | 'ACTION' | 'DATA' }[] = [
  { code: 'user:read',    name: '用户查询', kind: 'ACTION' },
  { code: 'user:write',   name: '用户编辑', kind: 'ACTION' },
  { code: 'user:delete',  name: '用户删除', kind: 'ACTION' },
  { code: 'role:read',    name: '角色查询', kind: 'ACTION' },
  { code: 'role:write',   name: '角色编辑', kind: 'ACTION' },
  { code: 'audit:read',   name: '审计查询', kind: 'ACTION' },
  { code: 'inv:read',     name: '库存查询', kind: 'ACTION' },
  { code: 'inv:write',    name: '库存录入', kind: 'ACTION' },
  { code: 'inv:audit',    name: '单据审核', kind: 'ACTION' },
];

async function main() {
  for (const r of ROLE_DEFS) {
    await prisma.role.upsert({
      where: { code: r.code },
      update: {},
      create: { code: r.code, name: r.name, isBuiltin: true },
    });
  }
  for (const p of PERM_DEFS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: {},
      create: { code: p.code, name: p.name, kind: p.kind },
    });
  }
  const root = await prisma.department.upsert({
    where: { code: 'ROOT' },
    update: {},
    create: { code: 'ROOT', name: '总部', path: '/ROOT', depth: 0, sort: 0 },
  });
  const tech = await prisma.department.upsert({
    where: { code: 'TECH' },
    update: {},
    create: { code: 'TECH', name: '技术部', parentId: root.id, path: '/ROOT/TECH', depth: 1, sort: 1 },
  });

  const passwordHash = await bcrypt.hash('Aa123456', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      employeeNo: 'A0001', username: 'admin', realName: '超级管理员',
      mobile: '13800000001', email: 'admin@local',
      passwordHash, deptId: root.id,
      status: 'ACTIVE', mustChangePassword: false, passwordUpdatedAt: new Date(),
    },
  });
  const sa = await prisma.role.findUniqueOrThrow({ where: { code: 'ROLE_SUPER_ADMIN' } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: sa.id } },
    update: {},
    create: { userId: admin.id, roleId: sa.id },
  });

  const sysAdmin = await prisma.user.upsert({
    where: { username: 'sysadmin' },
    update: {},
    create: {
      employeeNo: 'A0002', username: 'sysadmin', realName: '系统管理员',
      mobile: '13800000002', email: 'sys@local',
      passwordHash, deptId: tech.id,
      status: 'ACTIVE', mustChangePassword: false, passwordUpdatedAt: new Date(),
    },
  });
  const sar = await prisma.role.findUniqueOrThrow({ where: { code: 'ROLE_SYS_ADMIN' } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: sysAdmin.id, roleId: sar.id } },
    update: {},
    create: { userId: sysAdmin.id, roleId: sar.id },
  });

  // Inventory prerequisites for e2e: 1 Category / 1 Unit / 1 Warehouse / 1 Location
  await prisma.category.upsert({
    where: { code: 'CAT-DEFAULT' },
    update: {},
    create: { code: 'CAT-DEFAULT', name: '默认分类', path: '/CAT-DEFAULT', depth: 0, sort: 0 },
  });
  await prisma.unit.upsert({
    where: { code: 'UNIT-PCS' },
    update: {},
    create: { code: 'UNIT-PCS', name: '件' },
  });
  const wh = await prisma.warehouse.upsert({
    where: { code: 'WH-MAIN' },
    update: {},
    create: { code: 'WH-MAIN', name: '主仓库', kind: 'NORMAL', address: '总部一楼' },
  });
  await prisma.location.upsert({
    where: { warehouseId_code: { warehouseId: wh.id, code: 'LOC-A1' } },
    update: {},
    create: { warehouseId: wh.id, code: 'LOC-A1', name: 'A区-01货位' },
  });

  console.log('Seed OK. Login: admin / Aa123456');
}

main().finally(() => prisma.$disconnect());
