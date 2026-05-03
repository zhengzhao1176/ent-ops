import { getPrisma } from './db';
import bcrypt from 'bcryptjs';

let counter = 0;
const next = () => ++counter;

export const ROLE_CODES = {
  SUPER_ADMIN: 'ROLE_SUPER_ADMIN',
  SYS_ADMIN: 'ROLE_SYS_ADMIN',
  WAREHOUSE_MGR: 'ROLE_WAREHOUSE_MGR',
  WAREHOUSE_OP: 'ROLE_WAREHOUSE_OP',
  PURCHASER: 'ROLE_PURCHASER',
  SALES: 'ROLE_SALES',
  AUDITOR: 'ROLE_AUDITOR',
  USER: 'ROLE_USER',
} as const;

export async function seedBaseRoles() {
  const p = getPrisma();
  const roles = await Promise.all(
    Object.entries(ROLE_CODES).map(([key, code]) =>
      p.role.upsert({
        where: { code },
        update: {},
        create: { code, name: key, isBuiltin: true },
      }),
    ),
  );
  return Object.fromEntries(roles.map((r) => [r.code, r])) as Record<string, (typeof roles)[number]>;
}

export async function seedRootDepartment() {
  const p = getPrisma();
  return p.department.upsert({
    where: { code: 'ROOT' },
    update: {},
    create: { code: 'ROOT', name: '总部', path: '/ROOT', depth: 0, sort: 0, status: 'ACTIVE' },
  });
}

export interface UserSeedOverrides {
  employeeNo?: string;
  username?: string;
  realName?: string;
  mobile?: string;
  email?: string;
  password?: string;
  status?: 'PENDING' | 'ACTIVE' | 'DISABLED' | 'LOCKED' | 'DELETED';
  mustChangePassword?: boolean;
  deptId?: bigint;
  roleCodes?: string[];
}

export async function seedUser(overrides: UserSeedOverrides = {}) {
  const p = getPrisma();
  const dept = await seedRootDepartment();
  const i = next();
  const password = overrides.password ?? 'Aa123456';
  const passwordHash = await bcrypt.hash(password, 4); // low cost for tests
  const user = await p.user.create({
    data: {
      employeeNo: overrides.employeeNo ?? `E${String(i).padStart(4, '0')}`,
      username: overrides.username ?? `user${i}`,
      realName: overrides.realName ?? `测试用户${i}`,
      mobile: overrides.mobile ?? `138${String(10000000 + i).padStart(8, '0')}`,
      email: overrides.email ?? `u${i}@example.com`,
      passwordHash,
      deptId: overrides.deptId ?? dept.id,
      status: overrides.status ?? 'ACTIVE',
      mustChangePassword: overrides.mustChangePassword ?? false,
      passwordUpdatedAt: new Date(),
    },
  });

  if (overrides.roleCodes && overrides.roleCodes.length) {
    const roles = await p.role.findMany({ where: { code: { in: overrides.roleCodes } } });
    await p.userRole.createMany({
      data: roles.map((r) => ({ userId: user.id, roleId: r.id })),
    });
  }
  return { user, plainPassword: password };
}
