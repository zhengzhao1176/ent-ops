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

// ============================================================
// Inventory factories
// ============================================================

export interface CategorySeedOverrides {
  code?: string;
  name?: string;
  parentId?: bigint | null;
  path?: string;
  depth?: number;
  sort?: number;
  status?: 'ACTIVE' | 'DISABLED';
}

export async function seedCategory(overrides: CategorySeedOverrides = {}) {
  const p = getPrisma();
  const i = next();
  const code = overrides.code ?? `CAT${String(i).padStart(4, '0')}`;
  return p.category.create({
    data: {
      code,
      name: overrides.name ?? `分类${i}`,
      parentId: overrides.parentId ?? null,
      path: overrides.path ?? `/${code}`,
      depth: overrides.depth ?? 0,
      sort: overrides.sort ?? 0,
      status: overrides.status ?? 'ACTIVE',
    },
  });
}

export interface UnitSeedOverrides {
  code?: string;
  name?: string;
  baseUnitId?: bigint | null;
  ratio?: string | null;
  status?: 'ACTIVE' | 'DISABLED';
}

export async function seedUnit(overrides: UnitSeedOverrides = {}) {
  const p = getPrisma();
  const i = next();
  return p.unit.create({
    data: {
      code: overrides.code ?? `U${String(i).padStart(3, '0')}`,
      name: overrides.name ?? `单位${i}`,
      baseUnitId: overrides.baseUnitId ?? null,
      ratio: overrides.ratio ?? null,
      status: overrides.status ?? 'ACTIVE',
    },
  });
}

export interface GoodsSeedOverrides {
  code?: string;
  name?: string;
  categoryId?: bigint;
  unitId?: bigint;
  spec?: string | null;
  brand?: string | null;
  barcode?: string | null;
  safetyStock?: string | null;
  stockUpper?: string | null;
  shelfLifeDays?: number | null;
  image?: string | null;
  status?: 'ACTIVE' | 'DISABLED';
  remark?: string | null;
}

export async function seedGoods(overrides: GoodsSeedOverrides = {}) {
  const p = getPrisma();
  const i = next();
  const categoryId = overrides.categoryId ?? (await seedCategory({})).id;
  const unitId = overrides.unitId ?? (await seedUnit({})).id;
  return p.goods.create({
    data: {
      code: overrides.code ?? `G${String(i).padStart(5, '0')}`,
      name: overrides.name ?? `商品${i}`,
      categoryId,
      unitId,
      spec: overrides.spec ?? null,
      brand: overrides.brand ?? null,
      barcode: overrides.barcode ?? null,
      safetyStock: overrides.safetyStock ?? null,
      stockUpper: overrides.stockUpper ?? null,
      shelfLifeDays: overrides.shelfLifeDays ?? null,
      image: overrides.image ?? null,
      status: overrides.status ?? 'ACTIVE',
      remark: overrides.remark ?? null,
    },
  });
}

export interface WarehouseSeedOverrides {
  code?: string;
  name?: string;
  kind?: 'FINISHED' | 'RAW' | 'RETURN' | 'DEFECT';
  address?: string | null;
  managerId?: bigint | null;
  status?: 'ACTIVE' | 'DISABLED';
}

export async function seedWarehouse(overrides: WarehouseSeedOverrides = {}) {
  const p = getPrisma();
  const i = next();
  return p.warehouse.create({
    data: {
      code: overrides.code ?? `WH${String(i).padStart(3, '0')}`,
      name: overrides.name ?? `仓库${i}`,
      kind: overrides.kind ?? 'FINISHED',
      address: overrides.address ?? null,
      managerId: overrides.managerId ?? null,
      status: overrides.status ?? 'ACTIVE',
    },
  });
}

export interface LocationSeedOverrides {
  warehouseId?: bigint;
  code?: string;
  name?: string;
  capacity?: string | null;
  status?: 'ACTIVE' | 'DISABLED';
}

export async function seedLocation(overrides: LocationSeedOverrides = {}) {
  const p = getPrisma();
  const i = next();
  const warehouseId = overrides.warehouseId ?? (await seedWarehouse({})).id;
  return p.location.create({
    data: {
      warehouseId,
      code: overrides.code ?? `L${String(i).padStart(3, '0')}`,
      name: overrides.name ?? `库位${i}`,
      capacity: overrides.capacity ?? null,
      status: overrides.status ?? 'ACTIVE',
    },
  });
}

export interface StockSeedOverrides {
  warehouseId?: bigint;
  locationId?: bigint;
  goodsId?: bigint;
  batchNo?: string;
  qtyOnHand?: string;
  qtyLocked?: string;
  qtyAvailable?: string;
  qtyInTransit?: string;
  expireAt?: Date | null;
}

export async function seedStock(overrides: StockSeedOverrides = {}) {
  const p = getPrisma();
  const warehouseId = overrides.warehouseId ?? (await seedWarehouse({})).id;
  const locationId =
    overrides.locationId ?? (await seedLocation({ warehouseId })).id;
  const goodsId = overrides.goodsId ?? (await seedGoods({})).id;
  return p.stock.create({
    data: {
      warehouseId,
      locationId,
      goodsId,
      batchNo: overrides.batchNo ?? '',
      qtyOnHand: overrides.qtyOnHand ?? '0',
      qtyLocked: overrides.qtyLocked ?? '0',
      qtyAvailable: overrides.qtyAvailable ?? '0',
      qtyInTransit: overrides.qtyInTransit ?? '0',
      expireAt: overrides.expireAt ?? null,
    },
  });
}
